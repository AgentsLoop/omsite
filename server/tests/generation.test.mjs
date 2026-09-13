import assert from 'node:assert/strict'
import test from 'node:test'
import { generateIssue } from '../lib/generation.mjs'
import { clonePublicRepository } from '../lib/repository-clone.mjs'
import { withDeployments } from '../lib/profile-repositories.mjs'
import { remixRepository } from '../lib/repository-remix.mjs'

test('empty selection reuses the signed-in user Playground and user credentials', async () => {
  const calls = []
  const result = await generateIssue({ user: { login: 'player', token: 'user-token' }, prompt: 'Create a maze game', origin: 'https://omgithub.com', config: {}, requestGithub: async (path, token, options = {}) => {
    calls.push({ path, token })
    if (path === '/repos/player/PlayGround') return { full_name: 'player/PlayGround', default_branch: 'main', permissions: { push: true } }
    if (path.endsWith('/commits/main')) return { sha: 'a'.repeat(40) }
    if (path.endsWith('/issues')) return { number: 12, html_url: 'https://github.com/player/PlayGround/issues/12' }
    if (options.method === 'PUT') return {}
    return {}
  } })
  assert.equal(result.omgithub_path, '/player/PlayGround/issues/12')
  assert.ok(calls.every(call => call.token === 'user-token'))
  assert.ok(!calls.some(call => call.path === '/user/repos'))
})

test('clone skips occupied names and copies history before setting the default branch', async () => {
  const events = []
  const result = await clonePublicRepository({ repository: { default_branch: 'develop' }, owner: 'creator', repo: 'game', user: { login: 'player', token: 'token' },
    requestGithub: async (path, token, options = {}) => {
      events.push([path, options.method])
      if (path === '/repos/player/game') return {}
      if (path === '/repos/player/game-1' && !options.method) throw Object.assign(new Error('missing'), { status: 404 })
      if (path === '/user/repos') { assert.equal(JSON.parse(options.body).private, false); return { name: 'game-1' } }
      return {}
    }, copyHistory: async input => { assert.equal(input.source, 'creator/game'); assert.equal(input.target, 'player/game-1'); events.push(['copy']) }
  })
  assert.equal(result.full_name, 'player/game-1')
  assert.deepEqual(events.slice(-2), [['copy'], ['/repos/player/game-1', 'PATCH']])
})

test('only published roots supply the latest Open destination', () => {
  const repositories = [{ full_name: 'Player/Game' }, { full_name: 'player/folder-only' }]
  const projects = [
    { source_key: `player/game@${'a'.repeat(40)}`, status: 'published', public_path: '/player/game', published_at: '2026-01-01' },
    { source_key: `player/game@${'b'.repeat(40)}:game`, status: 'published', public_path: '/wrong', published_at: '2026-02-01' },
    { source_key: `player/folder-only@${'c'.repeat(40)}:game`, status: 'published', public_path: '/folder' }
  ]
  const rows = withDeployments(repositories, projects)
  assert.equal(rows[0].deployment_status, 'published')
  assert.equal(rows[0].deployment_path, '/player/game')
  assert.equal(rows[1].deployment_status, 'not_deployed')
})

test('reject private repository selection before writing', async () => {
  let calls = 0
  await assert.rejects(() => remixRepository({ owner: 'player', repo: 'private', prompt: 'Change the game', user: { token: 'token' }, requestGithub: async () => { calls++; return { private: true } } }), /Only public/)
  assert.equal(calls, 1)
})

test('reject invalid branch suffix beyond title cutoff before creating Playground', async () => {
  await assert.rejects(generateIssue({ user: { login: 'player', token: 'test' },
    prompt: 'x'.repeat(150) + ' branch: invalid branch',
    requestGithub: async () => { assert.fail('No GitHub changes before validation') }
  }), { status: 400 })
})
