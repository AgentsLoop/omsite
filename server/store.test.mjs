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
