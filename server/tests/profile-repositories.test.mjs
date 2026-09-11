import assert from 'node:assert/strict'
import test from 'node:test'
import { listProfileRepositories } from '../lib/profile-repositories.mjs'

test('exclude private repositories even if GitHub returns them', async () => {
  const calls = []
  const requestGithub = async (path, token) => {
    calls.push({ path, token })
    return [{
      id: 1,
      name: 'private-game',
      full_name: 'player/private-game',
      owner: { login: 'player' },
      private: true,
      permissions: { push: true },
      has_issues: true
    }]
  }

  const rows = await listProfileRepositories('Player', { login: 'player', token: 'viewer-token' }, requestGithub)

  assert.equal(calls.length, 1)
  assert.match(calls[0].path, /^\/user\/repos\?visibility=public/)
  assert.equal(calls[0].token, 'viewer-token')
  assert.deepEqual(rows, [])
})

test('list public repositories without exposing the viewer token on another profile', async () => {
  const calls = []
  const requestGithub = async (path, token) => {
    calls.push({ path, token })
    return []
  }

  await listProfileRepositories('creator', { login: 'viewer', token: 'viewer-token' }, requestGithub)

  assert.match(calls[0].path, /^\/users\/creator\/repos\?type=owner/)
  assert.equal(calls[0].token, '')
})
