import assert from 'node:assert/strict'
import test from 'node:test'
import { listProfileRepositories } from '../lib/profile-repositories.mjs'

test('list own public and private repositories with the signed-in token', async () => {
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
  assert.match(calls[0].path, /^\/user\/repos\?visibility=all/)
  assert.equal(calls[0].token, 'viewer-token')
  assert.equal(rows[0].private, true)
  assert.equal(rows[0].can_remix, true)
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
