import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createSessionStore } from '../lib/session-store.mjs'

test('sessions survive a store restart without exposing the GitHub token', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omgithub-sessions-'))
  try {
    const session = { user: { login: 'player', token: 'github-secret-token' }, expiresAt: 2000 }
    createSessionStore(directory, 'session-secret', () => 1000).set('session-id', session)

    const stored = await readFile(join(directory, 'sessions.enc.json'), 'utf8')
    assert.doesNotMatch(stored, /github-secret-token|player|session-id/)
    assert.deepEqual(createSessionStore(directory, 'session-secret', () => 1000).get('session-id'), session)
  } finally {
    await rm(directory, { recursive: true })
  }
})

test('expired sessions are removed from persistent storage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'omgithub-sessions-'))
  try {
    const store = createSessionStore(directory, 'session-secret', () => 2000)
    store.set('session-id', { user: { login: 'player' }, expiresAt: 1000 })
    assert.equal(store.get('session-id'), undefined)
    assert.equal(createSessionStore(directory, 'session-secret', () => 2000).get('session-id'), undefined)
  } finally {
    await rm(directory, { recursive: true })
  }
})
