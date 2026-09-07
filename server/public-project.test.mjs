import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import AdmZip from 'adm-zip'
import { materializePublicProject } from './public-project.mjs'

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
