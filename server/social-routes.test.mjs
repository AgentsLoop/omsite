import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createSocialRouter } from './social-routes.mjs'

test('social routes require a signed-in same-origin mutation and deduplicate visitor identity', async t => {
  const project = { id: 'game', status: 'published', url: 'https://game.omgithub.com' }
  const plays = [], votes = []
  const social = {
    summary: async () => ({ rating: 7, rating_count: 1, play_count: plays.length }),
    comments: async () => [],
    rate: async (...args) => votes.push(args),
    play: async (_project, key) => plays.push(key)
  }
  const app = express()
  app.use(express.json())
  app.use('/api/projects', createSocialRouter({ store: { byId: async id => id === 'game' ? project : null }, social,
    userFor: req => req.get('x-test-user') ? { id: 12, login: 'player' } : null, origin: 'https://omgithub.com', sessionSecret: 'test-secret' }))
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const base = `http://127.0.0.1:${server.address().port}/api/projects`
  const request = (path, options = {}) => fetch(`${base}/${path}`, options)
  assert.equal((await request('missing/social')).status, 404)
  assert.equal((await request('game/rating', { method: 'PUT', headers: { origin: 'https://omgithub.com' } })).status, 401)
  assert.equal((await request('game/rating', { method: 'PUT', headers: { origin: 'https://game.omgithub.com', 'x-test-user': '1' } })).status, 403)
  assert.equal(votes.length, 0)
  assert.equal((await request('game/rating', { method: 'PUT', headers: { origin: 'https://omgithub.com', 'x-test-user': '1', 'content-type': 'application/json' }, body: JSON.stringify({ rating: 8 }) })).status, 200)
  assert.equal(votes[0][2], 8)
  const first = await request('game/play', { redirect: 'manual', headers: { 'sec-fetch-mode': 'navigate' } })
  // Node fetch overwrites sec-fetch-mode; use the POST event for cookie checks.
  const event = await request('game/play', { method: 'POST', headers: { origin: 'https://omgithub.com' } })
  const cookie = event.headers.get('set-cookie').split(';')[0]
  const key = plays.at(-1)
  await request('game/play', { method: 'POST', headers: { origin: 'https://omgithub.com', cookie } })
  assert.equal(plays.at(-1), key)
  assert.equal(first.headers.get('location'), 'https://game.omgithub.com/')
  assert.equal((await request('game/social')).headers.get('cache-control'), 'no-store')
})
