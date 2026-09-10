import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { openDatabase } from '../lib/database.mjs'
import { createStore } from '../lib/store.mjs'
import { createProjectSocial } from '../lib/project-social.mjs'

test('Supabase preserves merges, concurrent social writes, and rollback', { skip: !process.env.SUPABASE_TEST_DB_URL }, async () => {
  const db = await openDatabase({ SUPABASE_DB_URL: process.env.SUPABASE_TEST_DB_URL })
  const id = randomUUID()
  const project = { id, repo_owner: 'database-test', repo: id, project_path: '', complexity_score: 6, slug: id }
  const store = createStore('/tmp/omgithub-db-test', db)
  const social = createProjectSocial('/tmp/omgithub-db-test', db)
  try {
    await store.put(project)
    await store.put({ id, title: 'Updated' })
    assert.equal((await store.bySlug(id)).title, 'Updated')
    assert.equal((await store.byId(id)).repo, id)
    const user = n => ({ id: n, login: 'test', avatar_url: '' })
    await Promise.all(Array.from({ length: 30 }, (_, n) => social.rate(project, user(n + 1), 10)))
    await Promise.all(Array.from({ length: 20 }, () => social.play(project, 'same-visitor')))
    const summary = await social.summary(project)
    assert.equal(summary.rating_count, 30)
    assert.equal(summary.play_count, 1)
    await social.comment(project, user(1), 'Test', 4)
    assert.equal((await social.comments(project))[0].rating, 4)
    await assert.rejects(db.transaction(id, async tx => {
      await tx.put('omgithub_projects', id, { id, title: 'Rolled back' })
      throw new Error('Abort')
    }), /Abort/)
    assert.equal((await store.byId(id)).title, 'Updated')
  } finally {
    // Remove only this isolated test project's rows.
    const { createHash } = await import('node:crypto')
    const pid = createHash('sha256').update(JSON.stringify(['database-test', id, ''])).digest('hex')
    await db.delete('omgithub_projects', id)
    await db.delete('project_social', pid)
    for (let n = 1; n <= 30; n++) {
      const key = pid + '_' + createHash('sha256').update(String(n)).digest('hex')
      await db.delete('project_ratings', key)
      await db.delete('project_comments', key)
    }
    await db.delete('project_plays', pid + '_' + createHash('sha256').update('same-visitor').digest('hex'))
    await db.close()
  }
})
