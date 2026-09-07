import express from 'express'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cookies, nonce, sign, verify } from './auth.mjs'
import { dispatchOmgRequest, extractUrls, github, omgRequest, verifyWebhookSignature } from './github.mjs'
import { materializePublicProject } from './public-project.mjs'
import { createStore } from './store.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const port = Number(process.env.PORT || 8787)
const origin = (process.env.PUBLIC_ORIGIN || `http://localhost:${port}`).replace(/\/$/, '')
const baseHost = new URL(origin).hostname.toLowerCase()
const publicHosts = [...new Set([baseHost, ...String(process.env.PUBLIC_ALIASES || 'lolgames.net').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)])]
const dataDir = resolve(process.env.DATA_DIR || join(root, 'data'))
const gamesDir = join(dataDir, 'games')
const owner = process.env.GITHUB_OWNER || 'AgentsLoop'
const repo = process.env.GITHUB_REPO || 'OhMyGithub'
const githubToken = process.env.GITHUB_TOKEN || ''
const githubApp = {
  appId: process.env.GITHUB_APP_ID || '',
  privateKey: String(process.env.GITHUB_APP_PRIVATE_KEY || '').replaceAll('\\n', '\n'),
  notificationToken: githubToken,
  fallbackOwner: process.env.OMG_FALLBACK_OWNER || 'AgentsLoop',
  fallbackRepo: process.env.OMG_FALLBACK_REPO || 'OhMyGithub',
  fallbackRef: process.env.OMG_FALLBACK_REF || 'main'
}
const sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex')
mkdirSync(gamesDir, { recursive: true })

let firestore = null
const firebaseCredential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8') : '')
if (firebaseCredential) {
  try {
    const account = JSON.parse(firebaseCredential)
    const firebase = getApps()[0] || initializeApp({ credential: cert(account) })
    firestore = getFirestore(firebase)
    console.log(`Firebase connected: ${account.project_id}`)
  } catch (error) { console.warn(`Firebase unavailable, using local persistence: ${error.message}`) }
}
const store = createStore(dataDir, firestore)
const sessions = new Map()
const rate = new Map()
const app = express()
app.set('trust proxy', true)
app.use((req, res, next) => { res.set('x-content-type-options', 'nosniff'); res.set('referrer-policy', 'strict-origin-when-cross-origin'); next() })

function userFor(req) {
  const raw = cookies(req.headers.cookie).omgithub_session
  const payload = raw && verify(raw, sessionSecret)
  return payload?.sid ? sessions.get(payload.sid) || null : null
}
function setSession(res, user) {
  const sid = nonce(); sessions.set(sid, user)
  res.setHeader('set-cookie', `omgithub_session=${encodeURIComponent(sign({ sid }, sessionSecret))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${origin.startsWith('https:') ? '; Secure' : ''}`)
}
function requestIp(req) { return String(req.ip || req.socket.remoteAddress || 'unknown') }
function limited(req) {
  const key = requestIp(req), now = Date.now(), entries = (rate.get(key) || []).filter(value => now - value < 3600000)
  if (entries.length >= 5) return true; entries.push(now); rate.set(key, entries); return false
}
function hostSlug(req) {
  const host = String(req.hostname || '').toLowerCase()
  const matchedHost = publicHosts.find(value => host.endsWith(`.${value}`))
  if (!matchedHost) return ''
  const slug = host.slice(0, -(matchedHost.length + 1))
  return /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/.test(slug) ? slug : ''
}
function safeGamePath(slug) { const path = resolve(gamesDir, slug); if (!path.startsWith(`${resolve(gamesDir)}${sep}`)) throw new Error('Unsafe game path'); return path }
function publicProject(project) { const { local_dir, ...safe } = project; return safe }
function card(project) { return { ...publicProject(project), issue_path: project.issue ? `/${project.repo_owner}/${project.repo}/issues/${project.issue}` : '', store_path: project.commit ? `/${project.repo_owner}/${project.repo}/tree/${project.commit}` : '', screenshot: project.screenshots?.[0] || '', status: project.status || 'published' } }
async function projects() { return await store.all() }

app.get('/health', (_req, res) => res.json({ ok: true, service: 'omgithub' }))
app.get('/auth/github', (req, res) => {
  if (!process.env.GITHUB_CLIENT_ID) return res.status(503).send('GitHub login is not configured')
  const state = nonce(); res.setHeader('set-cookie', `omgithub_oauth=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${origin.startsWith('https:') ? '; Secure' : ''}`)
  const params = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: `${origin}/auth/github/callback`, scope: 'read:user public_repo', state })
  res.redirect(`https://github.com/login/oauth/authorize?${params}`)
})
app.get('/auth/github/callback', async (req, res) => {
  try {
    if (!req.query.code || req.query.state !== cookies(req.headers.cookie).omgithub_oauth) throw new Error('Invalid OAuth state')
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code: req.query.code, redirect_uri: `${origin}/auth/github/callback` }) })
    const tokenData = await tokenResponse.json(); if (!tokenData.access_token) throw new Error(tokenData.error_description || 'GitHub did not return a token')
    const profile = await github('/user', tokenData.access_token); setSession(res, { login: profile.login, name: profile.name, avatar_url: profile.avatar_url, html_url: profile.html_url, token: tokenData.access_token })
    res.redirect(`/${profile.login}`)
  } catch (error) { res.status(400).send(`GitHub sign-in failed: ${error.message}`) }
})

app.post('/api/github/webhooks', express.raw({ type: 'application/json', limit: '2mb' }), async (req, res, next) => {
  try {
    if (!verifyWebhookSignature(req.body, req.headers['x-hub-signature-256'], process.env.GITHUB_WEBHOOK_SECRET || '')) {
      return res.status(401).json({ error: 'Invalid webhook signature' })
    }
    const payload = JSON.parse(req.body.toString('utf8'))
    const request = omgRequest(String(req.headers['x-github-event'] || ''), payload)
    if (!request) return res.status(202).json({ accepted: false })
    if (!githubApp.appId || !githubApp.privateKey) {
      return res.status(503).json({ error: 'GitHub App dispatch is not configured' })
    }
    const dispatched = await dispatchOmgRequest(request, githubApp)
    console.log(`OMG webhook routed ${request.repository}#${request.issueNumber} through ${dispatched.route}`)
    const accepted = !['missing-opencode-label', 'permissions-missing', 'invalid-branch'].includes(dispatched.route)
    res.status(202).json({ accepted, route: dispatched.route, missing_permissions: dispatched.missingPermissions || [], commented: dispatched.commented })
  } catch (error) { next(error) }
})

app.use(express.json({ limit: '2mb' }))
app.get('/api/me', (req, res) => { const user = userFor(req); res.json({ user: user ? { login: user.login, name: user.name, avatar_url: user.avatar_url, html_url: user.html_url } : null }) })
app.get('/api/projects', async (req, res, next) => { try { const user = userFor(req); let rows = await projects(); if (req.query.mine === '1') rows = user ? rows.filter(row => row.owner_login?.toLowerCase() === user.login.toLowerCase()) : []; res.json({ projects: rows.map(card) }) } catch (e) { next(e) } })
app.get('/api/profiles/:login', async (req, res, next) => { try { const profile = await github(`/users/${encodeURIComponent(req.params.login)}`, githubToken); const rows = (await projects()).filter(row => row.owner_login?.toLowerCase() === req.params.login.toLowerCase()); res.json({ profile, projects: rows.map(card) }) } catch (e) { next(e) } })

app.post('/api/issues', async (req, res, next) => {
  try {
    if (limited(req)) return res.status(429).json({ error: 'Creation limit reached. Try again later.' })
    const prompt = String(req.body.prompt || '').trim(); if (prompt.length < 8 || prompt.length > 12000) return res.status(400).json({ error: 'Prompt must be between 8 and 12,000 characters.' })
    const user = userFor(req), token = user?.token || githubToken
    if (!token) return res.status(503).json({ error: 'GitHub issue creation is not configured.' })
    const first = prompt.split('\n')[0].slice(0, 110)
    const body = `${prompt}\n\n---\nCreated with [OmGithub](${origin})${user ? ` by @${user.login}` : ''}.`
    const issue = await github(`/repos/${owner}/${repo}/issues`, token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: first, body }) })
    const labelToken = githubToken || token
    try {
      for (const label of ['Goal', 'OpenCode']) {
        await github(`/repos/${owner}/${repo}/issues/${issue.number}/labels`, labelToken, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ labels: [label] })
        })
      }
    } catch (error) {
      const warning = [
        '⚠️ **OpenCode did not start.**',
        '',
        'OmGithub created this issue but could not apply the required `Goal` and `OpenCode` labels.',
        'A repository administrator must grant the configured token Issues write access, then add the `OpenCode` label to retry.'
      ].join('\n')
      try {
        await github(`/repos/${owner}/${repo}/issues/${issue.number}/comments`, token, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: warning })
        })
      } catch {}
      return res.status(201).json({ number: issue.number, github_url: issue.html_url, omgithub_path: `/${owner}/${repo}/issues/${issue.number}`, started: false, warning: error.message })
    }
    res.status(201).json({ number: issue.number, github_url: issue.html_url, omgithub_path: `/${owner}/${repo}/issues/${issue.number}`, started: true })
  } catch (e) { next(e) }
})

app.get('/api/github/:owner/:repo/issues/:number', async (req, res, next) => {
  try {
    const path = `/repos/${encodeURIComponent(req.params.owner)}/${encodeURIComponent(req.params.repo)}`
    const [issue, comments] = await Promise.all([github(`${path}/issues/${req.params.number}`, githubToken), github(`${path}/issues/${req.params.number}/comments?per_page=100`, githubToken)])
    const urls = extractUrls(issue, comments)
    const projectPath = urls.project ? new URL(urls.project).pathname : ''
    res.json({ number: issue.number, title: issue.title, body: issue.body, status: issue.labels.some(l => l.name === 'complete') ? 'complete' : issue.labels.some(l => l.name === 'failed') ? 'failed' : 'in progress', github_url: issue.html_url, opencode_url: urls.opencode, preview_url: urls.preview, project_path: projectPath, screenshots: urls.screenshots })
  } catch (e) { next(e) }
})

app.get('/api/github/:owner/:repo/tree/:sha', async (req, res, next) => {
  try {
    const project = await materializePublicProject({ owner: req.params.owner, repo: req.params.repo, sha: req.params.sha, baseHost, gamesDir, store })
    res.json({ title: project.title, description: project.description, commit: project.commit, status: project.status, github_url: project.github_url, owner: project.owner_login, owner_avatar: project.owner_avatar, screenshots: project.screenshots, play_url: project.url, install_url: project.install_url })
  } catch (e) { next(e) }
})

app.use(async (req, res, next) => {
  const slug = hostSlug(req); if (!slug) return next()
  const project = await store.bySlug(slug); if (!project) return res.status(404).send('Game not found')
  if (req.path === '/manifest.webmanifest') return res.type('application/manifest+json').send(JSON.stringify({ name: project.title, short_name: project.title.slice(0, 28), description: project.description, start_url: '/', scope: '/', display: 'standalone', background_color: '#0c0c0d', theme_color: '#ff6719', icons: [{ src: '/omgithub-icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any maskable' }, { src: '/omgithub-icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' }] }))
  if (req.path === '/omgithub-icon.svg') return res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#111"/><text x="256" y="360" text-anchor="middle" font-family="system-ui" font-size="330" font-weight="800" fill="#ff6719">O</text></svg>`)
  if (req.path === '/omgithub-sw.js') return res.type('application/javascript').send(`self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));self.addEventListener('fetch',()=>{});`)
  if (req.path === '/install' || req.path === '/install/') {
    const shots = (project.screenshots || []).map(src => `<img src="${escapeHtml(src)}" alt="${escapeHtml(project.title)} screenshot">`).join('')
    return res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="theme-color" content="#ff6719"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/omgithub-icon.svg"><title>Install ${escapeHtml(project.title)}</title><style>${installCss}</style></head><body><main><section><i>O</i><small>OMGHITHUB APP</small><h1>Installing ${escapeHtml(project.title)}</h1><p id="status">Preparing native install support...</p><button id="install" disabled>Install</button><a href="/">Open app</a><a href="${origin}${project.store_path}">View store page</a></section></main><script>let event;const button=document.querySelector('#install');navigator.serviceWorker?.register('/omgithub-sw.js');addEventListener('beforeinstallprompt',e=>{e.preventDefault();event=e;button.disabled=false;document.querySelector('#status').textContent='Ready to install.'});button.onclick=async()=>{if(!event)return;event.prompt();const result=await event.userChoice;document.querySelector('#status').textContent=result.outcome==='accepted'?'Installed. You can open the game from your apps.':'Install cancelled.';event=null;button.disabled=true}</script></body></html>`)
  }
  return express.static(safeGamePath(slug), { fallthrough: true })(req, res, () => res.sendFile(join(safeGamePath(slug), 'index.html')))
})

app.use(express.static(join(root, 'dist')))
app.get('/*splat', (_req, res) => existsSync(join(root, 'dist/index.html')) ? res.type('html').send(readFileSync(join(root, 'dist/index.html'))) : res.status(503).send('Run npm run build first.'))
app.use((error, _req, res, _next) => { console.error(error); res.status(error.status || 500).json({ error: error.message || 'Unexpected error' }) })
app.listen(port, '0.0.0.0', () => console.log(`OmGithub listening on :${port} (${origin})`))

function escapeHtml(value) { return String(value || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
const installCss = `*{box-sizing:border-box}body{margin:0;background:#0c0c0d;color:#f5f5f2;font:16px system-ui}main{min-height:100vh;display:grid;place-items:center;padding:24px}section{width:min(430px,100%);display:flex;flex-direction:column;align-items:stretch;text-align:center;background:#19191a;border:1px solid #303033;border-radius:28px;padding:34px;box-shadow:0 24px 80px #0008}section i{align-self:center;width:96px;height:96px;display:grid;place-items:center;background:#111;color:#ff6719;border:1px solid #353538;border-radius:25px;font-size:58px;font-weight:800;font-style:normal}small{margin-top:22px;color:#ff6719;font-weight:800;letter-spacing:.12em}h1{font-size:27px;line-height:1.2;margin:12px 0}p{color:#99999d;line-height:1.5;margin:4px 0 20px}a,button{display:block;width:100%;padding:14px 20px;margin-top:11px;border:1px solid #3d3d40;background:#222224;border-radius:999px;color:#f5f5f2;text-decoration:none;font-weight:700;font-size:15px}button{background:#ff6719;color:#111;border-color:#ff6719}button:disabled{opacity:.35}`
