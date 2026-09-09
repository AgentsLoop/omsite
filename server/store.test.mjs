import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createStore } from './store.mjs'

test('looks up published projects by their named public path', async () => {
  const store = createStore(mkdtempSync(join(tmpdir(), 'omgithub-store-')))
  const project = { id: 'project-1', public_path: '/owner/repo/tree/main/games/example', status: 'published' }

  await store.put(project)

  assert.deepEqual(await store.byPublicPath(project.public_path), project)
  assert.equal(await store.byPublicPath('/owner/repo/tree/main/games/missing'), null)
  assert.deepEqual(await store.byId(project.id), project)
})

test('keeps selected HTML entries separate from their containing directory', async () => {
  const store = createStore(mkdtempSync(join(tmpdir(), 'omgithub-store-')))
  const sha = 'b'.repeat(40)
  const directory = { id: 'directory', source_key: `owner/repo@${sha}:games/example`, status: 'published', published_at: '2026-09-08T00:00:00.000Z' }
  const entry = { id: 'entry', source_key: `owner/repo@${sha}:games/example:play.html`, status: 'published', published_at: '2026-09-09T00:00:00.000Z' }
  await store.put(directory)
  await store.put(entry)
  assert.equal((await store.byRepositoryPath('owner', 'repo', 'games/example')).id, 'directory')
  assert.equal((await store.byRepositoryPath('owner', 'repo', 'games/example', 'play.html')).id, 'entry')
})

test('finds an older published project by repository and directory for path migration', async () => {
  const store = createStore(mkdtempSync(join(tmpdir(), 'omgithub-store-')))
  const project = {
    id: 'project-2',
    source_key: 'owner/repo@' + 'a'.repeat(40) + ':games/example',
    repo_owner: 'owner',
    repo: 'repo',
    status: 'published',
    published_at: '2026-09-08T00:00:00.000Z'
  }

  await store.put(project)

  assert.deepEqual(await store.byRepositoryPath('owner', 'repo', 'games/example'), project)
})
