import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createTokenSignIn } from '../lib/token-signin.mjs'

async function fixture(t, { github } = {}) {
  const sessions = []
  const app = express()
  app.use(createTokenSignIn({
    github: github || (async (_path, token) => ({ id: 12, login: token === 'ghp_abcdefghijklmnopqrstuvwxyz' ? 'player' : '' })),
    setSession: (res, user) => { sessions.push(user); res.cookie('session', 'test', { httpOnly: true }) }
  }))
  app.get('/', (_req, res) => res.send('home'))
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  return { base: `http://127.0.0.1:${server.address().port}`, sessions }
}

test('token query creates a session and redirects to a clean profile URL', async t => {
  const { base, sessions } = await fixture(t)
  const response = await fetch(`${base}/?token=ghp_abcdefghijklmnopqrstuvwxyz`, { redirect: 'manual' })
  assert.equal(response.status, 303)
  assert.equal(response.headers.get('location'), '/player')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.match(response.headers.get('set-cookie'), /^session=test;/)
  assert.equal(sessions[0].login, 'player')
  assert.equal(sessions[0].token, 'ghp_abcdefghijklmnopqrstuvwxyz')
})

test('ordinary home requests pass through without token validation', async t => {
  const { base, sessions } = await fixture(t)
  const response = await fetch(`${base}/`)
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'home')
  assert.deepEqual(sessions, [])
})

test('invalid and rejected tokens do not create sessions', async t => {
  const { base, sessions } = await fixture(t, { github: async () => { throw Object.assign(new Error('raw upstream detail'), { status: 401 }) } })
  assert.equal((await fetch(`${base}/?token=short`)).status, 400)
  const rejected = await fetch(`${base}/?token=ghp_abcdefghijklmnopqrstuvwxyz`)
  assert.equal(rejected.status, 401)
  assert.deepEqual(await rejected.json(), { error: 'GitHub rejected the token.' })
  assert.deepEqual(sessions, [])
})
