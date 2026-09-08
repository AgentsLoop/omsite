import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import AdmZip from 'adm-zip'
import { materializeLatestPublicProject, materializePublicProject } from './public-project.mjs'

function response(data, { status = 200, headers = {} } = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[name.toLowerCase()] || null },
    text: async () => String(body),
    arrayBuffer: async () => Buffer.from(body)
  }
}

test('materializes an immutable public commit without credentials', async () => {
  const sha = 'a'.repeat(40)
  const zip = new AdmZip()
  zip.addFile('owner-repo-a/dist/index.html', Buffer.from('<title>Actual Project</title><meta name="description" content="Actual project description"><h1>Project</h1>'))
  zip.addFile('owner-repo-a/dist/assets/app.js', Buffer.from('console.log("ok")'))
  zip.addFile('owner-repo-a/screenshots/final-play.png', Buffer.from('png'))
  zip.addFile('owner-repo-a/.opencode-web/private-runtime', Buffer.from('not published'))
  const calls = []
  const rows = []
  const store = {
    bySourceKey: async key => rows.find(row => row.source_key === key) || null,
    put: async project => { rows.push(project); return project }
  }
  const requestFetch = async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith(`/commits/${sha}`)) return response({ sha, commit: { message: 'Ship game' } })
    if (url.endsWith('/repos/owner/repo')) return response({ name: 'repo', private: false, description: 'Playable project', owner: { login: 'owner', avatar_url: 'avatar' } })
    if (url.endsWith(`/zipball/${sha}`)) return response(zip.toBuffer())
    return response({ message: 'not found' }, { status: 404 })
  }
  const gamesDir = join(mkdtempSync(join(tmpdir(), 'omgithub-public-')), 'games')

  const project = await materializePublicProject({ owner: 'owner', repo: 'repo', sha, baseHost: 'omgithub.com', gamesDir, store, requestFetch })

  assert.match(readFileSync(join(project.local_dir, 'index.html'), 'utf8'), /<h1>Project<\/h1>/)
  assert.equal(readFileSync(join(project.local_dir, 'assets/app.js'), 'utf8'), 'console.log("ok")')
  assert.equal(existsSync(join(project.local_dir, '.opencode-web')), false)
  assert.equal(project.title, 'Actual Project')
  assert.equal(project.description, 'Actual project description')
  assert.equal(project.store_path, `/owner/repo/tree/${sha}`)
  assert.equal(project.github_url, `https://github.com/owner/repo/tree/${sha}`)
  assert.deepEqual(project.screenshots, [`https://raw.githubusercontent.com/owner/repo/${sha}/screenshots/final-play.png`])
  assert.ok(calls.every(call => !call.options.headers.authorization))
})

test('requires a full commit SHA and a committed browser entrypoint', async () => {
  const store = { bySourceKey: async () => null }
  await assert.rejects(
    materializePublicProject({ owner: 'owner', repo: 'repo', sha: 'main', baseHost: 'omgithub.com', gamesDir: '/tmp/nope', store }),
    /full 40-character commit SHA/
  )

  const sha = 'b'.repeat(40)
  const zip = new AdmZip()
  zip.addFile('owner-repo-b/README.md', Buffer.from('hello'))
  const requestFetch = async url => {
    if (url.endsWith(`/commits/${sha}`)) return response({ sha, commit: { message: 'No app' } })
    if (url.endsWith('/repos/owner/repo')) return response({ name: 'repo', private: false, owner: { login: 'owner' } })
    return response(zip.toBuffer())
  }
  await assert.rejects(
    materializePublicProject({ owner: 'owner', repo: 'repo', sha, baseHost: 'omgithub.com', gamesDir: '/tmp/nope', store, requestFetch }),
    /must contain dist\/index.html or index.html/
  )
})

test('root projects exclude repository tooling and screenshots from deployment', async () => {
  const sha = 'c'.repeat(40)
  const zip = new AdmZip()
  zip.addFile('owner-repo-c/index.html', Buffer.from('<title>Root App</title>'))
  zip.addFile('owner-repo-c/app.js', Buffer.from('root app'))
  zip.addFile('owner-repo-c/.opencode-web/cloudflared', Buffer.from('tooling'))
  zip.addFile('owner-repo-c/screenshots/final-play.png', Buffer.from('png'))
  const rows = []
  const store = { bySourceKey: async () => null, put: async project => { rows.push(project); return project } }
  const requestFetch = async url => {
    if (url.endsWith(`/commits/${sha}`)) return response({ sha, commit: { message: 'Root app' } })
    if (url.endsWith('/repos/owner/repo')) return response({ name: 'repo', private: false, owner: { login: 'owner' } })
    return response(zip.toBuffer())
  }
  const gamesDir = join(mkdtempSync(join(tmpdir(), 'omgithub-root-')), 'games')

  const project = await materializePublicProject({ owner: 'owner', repo: 'repo', sha, baseHost: 'omgithub.com', gamesDir, store, requestFetch })

  assert.equal(readFileSync(join(project.local_dir, 'app.js'), 'utf8'), 'root app')
  assert.equal(existsSync(join(project.local_dir, '.opencode-web')), false)
  assert.equal(existsSync(join(project.local_dir, 'screenshots')), false)
  assert.equal(project.screenshots.length, 1)
})

test('resolves a repository shorthand to the latest default-branch commit', async () => {
  const sha = 'd'.repeat(40)
  const zip = new AdmZip()
  zip.addFile('owner-repo-d/index.html', Buffer.from('<title>Latest App</title>'))
  const rows = []
  const store = { bySourceKey: async key => rows.find(row => row.source_key === key) || null, put: async project => { rows.push(project); return project } }
  const requestFetch = async url => {
    if (url.endsWith('/repos/owner/repo')) return response({ name: 'repo', private: false, default_branch: 'main', owner: { login: 'owner' } })
    if (url.endsWith('/repos/owner/repo/commits/main')) return response({ sha })
    if (url.endsWith(`/commits/${sha}`)) return response({ sha, commit: { message: 'Latest app' } })
    if (url.endsWith(`/zipball/${sha}`)) return response(zip.toBuffer())
    return response({ message: 'not found' }, { status: 404 })
  }
  const gamesDir = join(mkdtempSync(join(tmpdir(), 'omgithub-latest-')), 'games')

  const project = await materializeLatestPublicProject({ owner: 'owner', repo: 'repo', baseHost: 'omgithub.com', gamesDir, store, requestFetch })

  assert.equal(project.commit, sha)
  assert.equal(project.store_path, `/owner/repo/tree/${sha}`)
  assert.equal(project.title, 'Latest App')
})

test('materializes a root-level GitHub Actions build ZIP', async () => {
  const sha = 'e'.repeat(40)
  const zip = new AdmZip()
  zip.addFile('index.html', Buffer.from('<title>Built App</title>'))
  zip.addFile('assets/app.js', Buffer.from('console.log("built")'))
  zip.addFile('screenshots/final-build.png', Buffer.from('png'))
  const rows = []
  const store = { bySourceKey: async key => rows.find(row => row.source_key === key) || null, put: async project => { rows.push(project); return project } }
  const requestFetch = async url => {
    if (url.endsWith('/repos/owner/repo')) return response({ name: 'repo', private: false, owner: { login: 'owner' } })
    if (url.endsWith(`/commits/${sha}`)) return response({ sha, commit: { message: 'Built app' } })
    return response({ message: 'not found' }, { status: 404 })
  }
  const gamesDir = join(mkdtempSync(join(tmpdir(), 'omgithub-build-')), 'games')

  const project = await materializePublicProject({ owner: 'owner', repo: 'repo', sha, baseHost: 'omgithub.com', gamesDir, store, archiveBuffer: zip.toBuffer(), buildRunId: '42', requestFetch })

  assert.equal(readFileSync(join(project.local_dir, 'index.html'), 'utf8'), '<title>Built App</title>')
  assert.equal(readFileSync(join(project.local_dir, 'assets/app.js'), 'utf8'), 'console.log("built")')
  assert.equal(readFileSync(join(project.local_dir, 'screenshots/final-build.png'), 'utf8'), 'png')
  assert.equal(project.build_method, 'github-actions')
  assert.equal(project.build_transport, 'omgithub-zip')
  assert.equal(project.build_run_id, '42')
  assert.deepEqual(project.screenshots, [`https://owner-repo-${'e'.repeat(12)}.omgithub.com/screenshots/final-build.png`])
})

test('materializes a selected game directory from a repository ZIP', async () => {
  const sha = 'f'.repeat(40)
  const zip = new AdmZip()
  zip.addFile('owner-repo-f/games/balance-astronaut/index.html', Buffer.from('<title>Balance Astronaut</title>'))
  zip.addFile('owner-repo-f/games/balance-astronaut/assets/game.js', Buffer.from('console.log("astronaut")'))
  const rows = []
  const store = { bySourceKey: async key => rows.find(row => row.source_key === key) || null, put: async project => { rows.push(project); return project } }
  const requestFetch = async url => {
    if (url.endsWith('/repos/owner/repo')) return response({ name: 'repo', private: false, owner: { login: 'owner' } })
    if (url.endsWith(`/commits/${sha}`)) return response({ sha, commit: { message: 'Selected game' } })
    if (url.endsWith(`/zipball/${sha}`)) return response(zip.toBuffer())
    return response({ message: 'not found' }, { status: 404 })
  }
  const gamesDir = join(mkdtempSync(join(tmpdir(), 'omgithub-subdirectory-')), 'games')

  const publicPath = '/owner/repo/tree/main/games/balance-astronaut'
  const project = await materializePublicProject({ owner: 'owner', repo: 'repo', sha, projectPath: 'games/balance-astronaut', publicPath, baseHost: 'omgithub.com', gamesDir, store, requestFetch, buildRunId: '43' })

  assert.equal(readFileSync(join(project.local_dir, 'index.html'), 'utf8'), '<title>Balance Astronaut</title>')
  assert.equal(readFileSync(join(project.local_dir, 'assets/game.js'), 'utf8'), 'console.log("astronaut")')
  assert.equal(project.public_path, publicPath)
  assert.equal(project.store_path, publicPath)
  assert.equal(project.legacy_store_path, `/owner/repo/tree/${sha}/games/balance-astronaut`)
  assert.match(project.slug, /-games-balance-astronaut|-[0-9a-f]{8}$/)
})
