import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, posix, join } from 'node:path'

export const DEFAULT_LIMITS = Object.freeze({ sources: 120, files: 16, depth: 6, links: 40, linkDepth: 0, games: 80, bytes: 524288, treeEntries: 30000 })
const encodePath = value => value.split('/').map(encodeURIComponent).join('/')

export function normalizeSource(input) {
  const value = typeof input === 'string' ? { url: input } : input
  if (!value?.url) throw new Error('A GitHub source URL is required')
  const url = new URL(value.url.startsWith('https://') ? value.url : `https://github.com/${value.url}`)
  if (url.hostname !== 'github.com' || url.username || url.password || url.port) throw new Error('Use a github.com URL')
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  const [owner, rawRepo, kind, urlRef, ...rest] = parts
  const repo = rawRepo?.replace(/\.git$/i, '')
  if (!/^[\w-]+$/.test(owner || '') || !/^[\w.-]+$/.test(repo || '')) throw new Error('Invalid GitHub repository')
  if (kind && !['tree', 'blob'].includes(kind)) throw new Error('Use a repository, tree, or HTML blob URL')
  if (kind && !urlRef) throw new Error('A tree or blob URL requires a ref')
  let path = value.path ?? rest.join('/')
  let entry = value.entry || ''
  if (kind === 'blob' && value.path === undefined) {
    entry = posix.basename(path)
    path = posix.dirname(path) === '.' ? '' : posix.dirname(path)
  }
  if (path.split('/').some(p => p === '..' || p === '.') || /[\\\x00-\x1f]/.test(path)) throw new Error('Unsafe project path')
  path = path.replace(/^\/+|\/+$/g, '')
  if (entry && (!/^[^/\\]+\.html?$/i.test(entry) || entry.includes('..'))) throw new Error('Select an HTML entry file')
  // An index entry and its containing folder are the same playable project.
  if (entry === 'index.html') entry = ''
  return { ...value, owner: owner.toLowerCase(), repo: repo.toLowerCase(), ref: value.ref || urlRef || '', path, entry,
    url: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}${kind ? `/${kind}/${encodeURIComponent(value.ref || urlRef)}/${encodePath(rest.join('/'))}` : ''}`.replace(/\/$/, '') }
}

export function canonicalKey(source) {
  return `${source.owner.toLowerCase()}/${source.repo.toLowerCase()}:${source.path || ''}:${source.entry === 'index.html' ? '' : source.entry || ''}`
}

export function dedupeSources(sources) {
  const unique = new Map()
  for (const input of sources) {
    const source = normalizeSource(input)
    if (!unique.has(canonicalKey(source))) unique.set(canonicalKey(source), source)
  }
  return [...unique.values()]
}

export function recordKey(row) {
  for (const path of [row.public_path, row.store_path, row.github_url]) {
    if (!path) continue
    try { return canonicalKey(normalizeSource(path.startsWith('/') ? `https://github.com${path}` : path)) } catch { /* Try legacy identity. */ }
  }
  const match = row.source_key?.match(/^([^/]+)\/([^@]+)@[^:]+(?::([^:]*))?(?::(.+))?$/)
  if (match) return canonicalKey({ owner: match[1], repo: match[2], path: match[3] || '', entry: match[4] || '' })
  if (row.repo && (row.repo_owner || row.owner_login)) return canonicalKey({ owner: row.repo_owner || row.owner_login, repo: row.repo, path: row.project_path || '', entry: row.source_entry || '' })
  return null
}

export async function writeJson(file, data) {
  await mkdir(dirname(file), { recursive: true })
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 })
  await rename(temporary, file)
}

export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch (error) { if (error.code === 'ENOENT') return fallback; throw error }
}

export function createGithubCache({ token, directory, ttlMs = 30 * 86400000, requestFetch = fetch, now = Date.now }) {
  if (!token) throw new Error('GITHUB_TOKEN is required')
  const pending = new Map()
  return async function get(url) {
    const parsed = new URL(url)
    if (parsed.origin !== 'https://api.github.com' || parsed.username || parsed.password) throw new Error('Invalid GitHub API URL')
    if (pending.has(url)) return pending.get(url)
    const operation = (async () => {
      const file = join(directory, `${createHash('sha256').update(url).digest('hex')}.json`)
      const cached = await readJson(file, null)
      if (cached?.url === url && now() - cached.fetched_at < ttlMs) return cached.body
      const response = await requestFetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000), headers: {
        accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'OmGithub-Catalog-Import', 'x-github-api-version': '2022-11-28'
      } })
      if (!response.ok) throw new Error(`GitHub HTTP ${response.status}: ${url}`)
      const body = await response.json()
      await writeJson(file, { url, fetched_at: now(), body })
      return body
    })()
    pending.set(url, operation)
    try { return await operation } catch (error) { pending.delete(url); throw error }
  }
}

export function githubLinks(text, limit = 40) {
  const links = []
  for (const match of text.matchAll(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\/[^\s<>"'`|)\]]*)?/g)) {
    try {
      const source = normalizeSource(match[0].replace(/[.,;]+$/, ''))
      if (!links.some(item => canonicalKey(item) === canonicalKey(source))) links.push(source)
      if (links.length >= limit) break
    } catch { /* Ignore issues, assets, and non-playable blobs. */ }
  }
  return links
}

// Extract only explicitly labelled source text. Do not generate or paraphrase prompts.
export function extractPrompts(text, { sourceUrl, fallback = null, catalog = false, filename = '' }) {
  const results = []
  const add = (prompt, targets, location) => {
    if (typeof prompt !== 'string' || !prompt.trim()) return
    const distinct = new Map(targets.map(target => [canonicalKey(target), target]))
    const target = distinct.size === 1 ? [...distinct.values()][0] : distinct.size === 0 && !catalog ? fallback : null
    results.push({ prompt, prompt_source: catalog ? 'github-list' : 'github-file', prompt_source_url: sourceUrl,
      location, target, unresolved_reason: target ? undefined : 'No unique game source beside this prompt' })
  }
  if (/\.json$/i.test(filename)) {
    let data
    try { data = JSON.parse(text) } catch { return results }
    const walk = (node, pointer = '', depth = 0) => {
      if (!node || typeof node !== 'object' || depth > 20) return
      if (!Array.isArray(node)) {
        // Only associate sibling source fields; never inherit another catalog record's URL.
        const links = Object.entries(node).filter(([key, value]) => /^(?:url|github|github_url|repo|repository|source|source_url|original_source|original_url|original_repo)$/i.test(key) && typeof value === 'string')
          .flatMap(([, value]) => githubLinks(value))
        for (const [key, value] of Object.entries(node)) if (/^(?:prompt|original_prompt|creation_prompt|user_prompt)$/i.test(key)) add(value, links, `${pointer}/${key}`)
      }
      for (const [key, value] of Object.entries(node)) walk(value, `${pointer}/${key}`, depth + 1)
    }
    walk(data)
  } else {
    // Keep table cell contents byte-for-byte, including spaces and Markdown.
    const lines = text.split('\n')
    let headers = null
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes('|')) { headers = null; continue }
      const cells = lines[i].replace(/^\|/, '').replace(/\|\r?$/, '').split(/(?<!\\)\|/)
      if (cells.some(cell => /^\s*(?:original\s+)?prompt\s*$/i.test(cell))) { headers = cells; continue }
      if (!headers || cells.every(cell => /^\s*:?-+:?\s*$/.test(cell))) continue
      const index = headers.findIndex(cell => /^\s*(?:original\s+)?prompt\s*$/i.test(cell))
      add(cells[index], githubLinks(lines[i]), `line:${i + 1}`)
    }
    // Bound association to the current heading section.
    const sections = [...text.matchAll(/(?:^|\n)#{1,6} [^\n]*(?:\n|$)[\s\S]*?(?=\n#{1,6} |$)/g)]
    const blocks = sections.length ? sections.map(match => ({ text: match[0], offset: match.index })) : [{ text, offset: 0 }]
    for (const block of blocks) {
      const links = githubLinks(block.text)
      for (const match of block.text.matchAll(/(?:^|\n)(?:#{1,6}\s+|\*\*)?(?:original\s+|creation\s+|user\s+)?prompt(?:\*\*)?\s*:?[ \t]*\r?\n(?:\r?\n)?(?:```[^\n]*\n([\s\S]*?)\n```|((?:>[^\n]*(?:\n|$))+))/gi)) {
        const prompt = match[1] !== undefined ? match[1] : match[2].replace(/^> ?/gm, '').replace(/\n$/, '')
        add(prompt, links, `offset:${block.offset + match.index}`)
      }
      for (const match of block.text.matchAll(/(?:^|\n)(?:\*\*)?(?:original\s+)?prompt(?:\*\*)?\s*:[ \t]*["“]([^\n]*?)["”][ \t]*(?:\r?\n|$)/gi)) add(match[1], links, `offset:${block.offset + match.index}`)
    }
    if (!results.length && /(?:^|\/)prompt\.txt$/i.test(filename)) add(text, [], 'file')
  }
  return [...new Map(results.map(item => [`${item.target ? canonicalKey(item.target) : '?'}\0${item.prompt}\0${item.prompt_source_url}`, item])).values()]
}

export function discoverGames(source, entries, { depth = 6, games = 80 } = {}) {
  const prefix = source.path ? `${source.path}/` : ''
  const candidates = []
  for (const item of entries) {
    if (item.type !== 'blob' || !item.path.startsWith(prefix) || !/\.html?$/i.test(item.path)) continue
    const relative = item.path.slice(prefix.length)
    if (relative.split('/').length - 1 > depth || /(?:^|\/)(?:node_modules|vendor|\.git|coverage|test|tests)(?:\/|$)/.test(relative)) continue
    if (source.entry && item.path !== `${prefix}${source.entry}`) continue
    const entry = posix.basename(item.path)
    const folder = posix.dirname(item.path) === '.' ? '' : posix.dirname(item.path)
    // A catalog's own landing page is not a game candidate.
    if (source.kind !== 'game' && folder === source.path && entry === 'index.html') continue
    const path = entry === 'index.html' && /(?:^|\/)dist$/.test(folder) ? folder.replace(/(?:^|\/)dist$/, '') : folder
    candidates.push({ ...source, path, entry: entry === 'index.html' ? '' : entry, kind: 'game', discovered_from: source.url })
  }
  return [...new Map(candidates.map(item => [canonicalKey(item), item])).values()].slice(0, games)
}

export function progressUrl(origin, source) {
  const root = `${origin.replace(/\/$/, '')}/api/github/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}`
  if (!source.path && !source.entry) return `${root}/progress`
  if (!source.ref || /^[a-f0-9]{40}$/i.test(source.ref)) throw new Error('Publication requires a named ref for selected paths')
  return `${root}/${source.entry ? 'blob' : 'tree'}/${encodeURIComponent(source.ref)}/${encodePath([source.path, source.entry].filter(Boolean).join('/'))}/progress`
}

export async function publishCandidate(source, { origin, requestFetch = fetch, attempts = 6, pollMs = 5000, onProgress = async () => {}, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const url = progressUrl(origin, source)
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await requestFetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) })
    const body = await response.json()
    if (!response.ok && body.state !== 'failed') throw new Error(`OmGithub HTTP ${response.status}`)
    await onProgress({ ...body, progress_url: url })
    if (['published', 'failed'].includes(body.state)) return { ...body, progress_url: url }
    if (attempt + 1 < attempts) await sleep(pollMs)
  }
  return { state: 'pending', progress_url: url }
}

export async function applyPromptRecords(prompts, store, rows = null) {
  const projects = rows || await store.all()
  const counts = { imported: 0, updated: 0, skipped: 0, duplicate: 0, unresolved: 0 }
  const pending = [], seen = new Set()
  for (const evidence of prompts) {
    if (!evidence.target) { pending.push(evidence); counts.unresolved++; continue }
    const key = canonicalKey(evidence.target)
    if (seen.has(key)) { counts.duplicate++; pending.push({ ...evidence, unresolved_reason: 'Additional prompt for the same game; retain for review' }); continue }
    seen.add(key)
    const matches = projects.filter(row => row.status === 'published' && recordKey(row) === key)
      .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')))
    const row = matches[0]
    if (!row) { pending.push(evidence); counts.unresolved++; continue }
    if (row.prompt === evidence.prompt && row.prompt_source_url === evidence.prompt_source_url) { counts.skipped++; continue }
    const metadata = { prompt: evidence.prompt, prompt_source: evidence.prompt_source, prompt_source_url: evidence.prompt_source_url,
      metadata_source: 'import', metadata_updated_at: evidence.extracted_at || new Date().toISOString() }
    await store.put({ ...row, ...metadata })
    counts[row.prompt ? 'updated' : 'imported']++
    Object.assign(row, metadata)
  }
  return { counts, pending }
}

export async function scanSource(input, { github, limits = DEFAULT_LIMITS }) {
  const source = normalizeSource(input)
  const api = `https://api.github.com/repos/${source.owner}/${source.repo}`
  const repository = await github(api)
  source.ref ||= repository.default_branch
  if (!source.ref) throw new Error('Repository has no default branch')
  const tree = await github(`${api}/git/trees/${encodeURIComponent(source.ref)}?recursive=1`)
  const entries = (tree.tree || []).slice(0, limits.treeEntries)
  const prefix = source.path ? `${source.path}/` : ''
  const files = entries.filter(item => item.type === 'blob' && item.path.startsWith(prefix) && item.path.slice(prefix.length).split('/').length - 1 <= limits.depth
    && /(?:^|\/)(?:readme[^/]*\.(?:md|txt)|[^/]*prompt[^/]*\.(?:md|txt|json)|[^/]+\.json|[^/]+\.md)$/i.test(item.path)
    && !/(?:^|\/)(?:node_modules|vendor|\.git)(?:\/|$)|(?:package-lock|yarn.lock|pnpm-lock)/.test(item.path)
    && item.size <= limits.bytes)
    .sort((a, b) => Number(!/readme|prompt/i.test(a.path)) - Number(!/readme|prompt/i.test(b.path)) || a.path.localeCompare(b.path))
  const discovered = discoverGames(source, entries, limits)
  const primary = source.kind === 'game' ? { ...source, kind: 'game', review_required: false } : null
  const candidates = [primary, ...discovered.map(candidate => ({ ...candidate, review_required: true }))]
    .filter(Boolean)
    .filter((candidate, index, rows) => rows.findIndex(other => canonicalKey(other) === canonicalKey(candidate)) === index)
  const prompts = [], links = [], errors = []
  for (const file of files.slice(0, limits.files)) {
    try {
      const blob = await github(`${api}/git/blobs/${file.sha}`)
      if (blob.encoding !== 'base64' || blob.size > limits.bytes) continue
      const text = Buffer.from(blob.content, 'base64').toString('utf8')
      if (Buffer.byteLength(text) > limits.bytes) continue
      const sourceUrl = `https://github.com/${source.owner}/${source.repo}/blob/${tree.sha || encodeURIComponent(source.ref)}/${encodePath(file.path)}`
      const folder = posix.dirname(file.path) === '.' ? '' : posix.dirname(file.path)
      const nearby = candidates.filter(candidate => candidate.path === folder)
      const fallback = nearby.length === 1 ? nearby[0] : folder === source.path && source.kind === 'game' ? source : null
      prompts.push(...extractPrompts(text, { sourceUrl, fallback, catalog: source.kind !== 'game', filename: file.path }).map(item => ({ ...item, extracted_at: new Date().toISOString() })))
      if (source.kind === 'catalog') links.push(...githubLinks(text, limits.links))
    } catch (error) { errors.push({ file: file.path, error: error.message }) }
  }
  return { source, candidates, prompts, links: dedupeSources(links).slice(0, limits.links), errors,
    bounds: { truncated_tree: Boolean(tree.truncated) || (tree.tree?.length || 0) > limits.treeEntries, files_available: files.length, files_read: Math.min(files.length, limits.files), game_limit_reached: discovered.length >= limits.games } }
}
