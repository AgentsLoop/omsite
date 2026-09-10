import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createProjectSocial } from '../lib/project-social.mjs'

const project = { repo_owner: 'Owner', repo: 'Game', source_key: `owner/game@${'a'.repeat(40)}:games/One`, complexity_score: 6 }
const user = { id: 12, login: 'player', avatar_url: 'https://github.com/player.png' }

// Model transaction serialization and rollback. Verify PostgreSQL separately.
function fakeDatabase() {
  let records = new Map(), tail = Promise.resolve()
  return {
    failNext: false,
    dump: () => records,
    async list(table, { field, value } = {}) {
      return [...records].filter(([key, row]) => key.startsWith(table + '/') && (!field || row[field] === value)).map(([, row]) => structuredClone(row))
    },
    transaction(key, fn) {
      const run = tail.then(async () => {
        const pending = structuredClone(records)
        const result = await fn({
          async get(table, id) { return structuredClone(pending.get(table + '/' + id)) },
          async put(table, id, value) { pending.set(table + '/' + id, structuredClone(value)) },
          async delete(table, id) { pending.delete(table + '/' + id) }
        })
        if (this.failNext) { this.failNext = false; throw new Error('Transaction failed') }
        records = pending
        return result
      })
      tail = run.catch(() => {})
      return run
    }
  }
}

async function fixture(t, remote) {
  const dir = await mkdtemp(join(tmpdir(), 'omgithub-social-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const db = remote ? fakeDatabase() : null
  return { dir, db, social: createProjectSocial(dir, db) }
}

for (const remote of [false, true]) {
  const backend = remote ? 'Database transaction double' : 'local'
  test(`${backend}: seeded votes, editable comments, deletion, and stable identity`, async t => {
    const { social, dir, db } = await fixture(t, remote)
    assert.deepEqual(await social.summary(project), { rating: 6, rating_count: 0, play_count: 0 })
    assert.equal((await social.summary(project, user.id)).my_rating, null)
    assert.deepEqual(await social.rate(project, user, 10), { rating: 8, rating_count: 1, play_count: 0, my_rating: 10 })
    await social.comment(project, user, ' First comment ', 8)
    const [first] = await social.comments(project)
    assert.equal(first.body, 'First comment')
    assert.equal(first.rating, 8)
    assert.equal(first.user_id, '12')
    await social.comment(project, { ...user, login: 'renamed' }, 'Edited')
    const [edited] = await social.comments(project)
    assert.equal(edited.created_at, first.created_at)
    assert.equal(edited.login, 'renamed')
    assert.equal(edited.rating, 8)
    await social.rate(project, user, 4)
    assert.equal((await social.comments(project))[0].rating, 4)
    await social.deleteComment(project, user)
    await social.deleteComment(project, user)
    assert.deepEqual(await social.comments(project), [])
    const newer = { ...project, repo_owner: 'OWNER', repo: 'GAME', source_key: project.source_key.replace('a'.repeat(40), 'b'.repeat(40)), complexity_score: 10 }
    assert.deepEqual(await createProjectSocial(dir, db).summary(newer, '12'), { rating: 5, rating_count: 1, play_count: 0, my_rating: 4 })
    assert.equal((await social.summary({ ...project, project_path: '' })).rating_count, 0)
    assert.equal((await social.summary({ ...project, project_path: 'games/one' })).rating_count, 0)
    assert.equal((await social.summary({ ...project, project_path: 'games/One', source_entry: 'other.html' })).rating_count, 0)
    assert.equal((await social.summary({ repo_owner: 'owner', repo: 'game', public_path: '/owner/game/tree/main/games/One' })).rating_count, 1)
  })

  test(`${backend}: concurrent votes and plays remain atomic`, async t => {
    const { social, dir, db } = await fixture(t, remote)
    const second = createProjectSocial(dir, db)
    await Promise.all(Array.from({ length: 30 }, (_, i) => (i % 2 ? social : second).rate(project, { ...user, id: i + 1 }, 10)))
    await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? social : second).rate(project, user, 2)))
    assert.equal((await social.summary(project)).rating_count, 30)
    assert.equal((await social.summary(project)).rating, (6 + 29 * 10 + 2) / 31)
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? social : second).play(project, 'anon:private-cookie')))
    assert.equal(results.filter(result => result.counted).length, 1)
    await social.play(project, 'user:12')
    assert.equal((await social.summary(project)).play_count, 2)
    const stored = remote ? JSON.stringify([...db.dump()]) : await readFile(join(dir, 'project-social.json'), 'utf8')
    assert.equal(stored.includes('private-cookie'), false)
    assert.equal(JSON.stringify(await social.summary(project)).includes('seed'), false)
  })

  test(`${backend}: rolling 24-hour window does not extend on duplicates`, async t => {
    const { social } = await fixture(t, remote)
    const start = Date.UTC(2026, 8, 9, 23)
    t.mock.method(Date, 'now', () => start)
    assert.equal((await social.play(project, 'anon:key')).counted, true)
    Date.now.mock.mockImplementation(() => start + 24 * 3600000 - 1)
    assert.equal((await social.play(project, 'anon:key')).counted, false)
    Date.now.mock.mockImplementation(() => start + 24 * 3600000)
    const result = await social.play(project, 'anon:key')
    assert.equal(result.counted, true)
    assert.equal(result.play_count, 2)
  })

  test(`${backend}: reject invalid input without changing aggregates`, async t => {
    const { social } = await fixture(t, remote)
    for (const value of [0, 11, 1.5, '5', null, NaN]) {
      await assert.rejects(social.rate(project, user, value), { status: 400 })
      await assert.rejects(social.comment(project, user, 'Text', value), { status: 400 })
    }
    for (const body of ['', '  ', null, 'x'.repeat(5001), 'bad\0text']) await assert.rejects(social.comment(project, user, body), { status: 400 })
    for (const key of ['', ' ', null, 'x'.repeat(513)]) await assert.rejects(social.play(project, key), { status: 400 })
    await assert.rejects(social.rate(project, null, 5), { status: 401 })
    await assert.rejects(social.summary(project, ''), { status: 401 })
    await assert.rejects(social.rate(project, { ...user, avatar_url: 'javascript:alert(1)' }, 5), { status: 400 })
    await assert.rejects(social.summary({}), { status: 400 })
    await assert.rejects(social.summary({ ...project, project_path: '../bad' }), { status: 400 })
    assert.equal((await social.summary(project)).rating_count, 0)
    await social.comment(project, user, 'x'.repeat(5000))
    assert.equal((await social.comments(project))[0].body.length, 5000)
    assert.equal((await social.summary(project)).rating_count, 0)
    assert.equal((await social.summary({ ...project, project_path: 'new', complexity_score: 4.5 })).rating, null)
  })

  test(`${backend}: missing complexity has no synthetic vote`, async t => {
    const { social } = await fixture(t, remote)
    const legacy = { ...project, complexity_score: undefined }
    assert.deepEqual(await social.summary(legacy, 12), { rating: null, rating_count: 0, play_count: 0, my_rating: null })
    await social.play(legacy, 'anon:legacy')
    assert.equal((await social.summary(legacy)).rating, null)
    assert.equal((await social.rate(legacy, user, 8)).rating, 8)
    assert.equal((await social.rate(legacy, { ...user, id: 13 }, 4)).rating, 6)
    assert.equal((await social.summary(legacy, 12)).my_rating, 8)
  })

  test(`${backend}: metadata backfill can add the private rating seed after an earlier play`, async t => {
    const { social } = await fixture(t, remote)
    const legacy = { ...project, complexity_score: undefined }
    await social.play(legacy, 'anon:before-metadata')
    assert.equal((await social.summary(legacy)).rating, null)
    assert.equal((await social.summary({ ...legacy, complexity_score: 7 })).rating, 7)
    assert.equal((await social.rate({ ...legacy, complexity_score: 7 }, user, 9)).rating, 8)
  })

  test(`${backend}: public comments are bounded, newest first, and moderated`, async t => {
    const { social, db } = await fixture(t, remote)
    const start = Date.now()
    t.mock.method(Date, 'now', () => start)
    for (let i = 1; i <= 102; i++) {
      Date.now.mock.mockImplementation(() => start + i)
      await social.comment(project, { ...user, id: i }, `Comment ${i}`)
    }
    if (db) {
      const row = [...db.dump()].find(([key, value]) => key.startsWith('project_comments/') && value.user_id === '102')[1]
      row.status = 'hidden'
      row.private_audit = 'secret'
      await social.comment(project, { ...user, id: 102 }, 'Cannot bypass moderation')
    }
    const comments = await social.comments(project)
    assert.equal(comments.length, 100)
    assert.equal(comments[0].user_id, remote ? '101' : '102')
    assert.equal(JSON.stringify(comments).includes('secret'), false)
  })
}

test('Database abort leaves both comments and aggregate unchanged', async t => {
  const { social, db } = await fixture(t, true)
  db.failNext = true
  await assert.rejects(social.comment(project, user, 'Abort', 10), /Transaction failed/)
  assert.deepEqual(await social.comments(project), [])
  assert.equal((await social.summary(project)).rating_count, 0)
  await social.comment(project, user, 'Retry', 10)
  assert.equal((await social.summary(project)).rating_count, 1)
})

test('selected HTML routes share identity across refs and explicit fields', async t => {
  const { social } = await fixture(t, false)
  await social.rate({ ...project, public_path: '/owner/game/blob/main/games/One/play.html' }, user, 10)
  const explicit = { ...project, project_path: 'games/One', source_entry: 'play.html' }
  assert.equal((await social.summary(explicit)).rating_count, 1)
  assert.equal((await social.summary({ ...project, public_path: `/owner/game/blob/${'c'.repeat(40)}/games/One/play.html` })).rating_count, 1)
  assert.equal((await social.summary(project)).rating_count, 0)
})
