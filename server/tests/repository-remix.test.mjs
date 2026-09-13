import assert from 'node:assert/strict'
import test from 'node:test'
import { remixRepository } from '../lib/repository-remix.mjs'

const workflowSha = 'a'.repeat(40)

function githubMock({ canWrite = true } = {}) {
  const calls = []
  const requestGithub = async (path, token, options = {}) => {
    calls.push({ path, token, ...options })
    if (path === '/repos/player/game') return { full_name: 'player/game', default_branch: 'main', has_issues: true, permissions: { push: canWrite } }
    if (path === '/repos/AgentsLoop/OhMyGithub/commits/main') return { sha: workflowSha }
    if (path.startsWith('/repos/AgentsLoop/OhMyGithub/contents/.github/workflows/')) return { sha: 'verified' }
    if (path === '/repos/player/game/contents/.github/workflows/opencode.yml?ref=main') throw Object.assign(new Error('Not Found'), { status: 404 })
    if (path === '/repos/player/game/contents/.github/workflows/opencode.yml' && options.method === 'PUT') return { content: {} }
    if (path === '/repos/player/game/labels/OpenCode') throw Object.assign(new Error('Not Found'), { status: 404 })
    if (path === '/repos/player/game/labels' && options.method === 'POST') return { name: 'OpenCode' }
    if (path === '/repos/player/game/issues' && options.method === 'POST') return { number: 42, html_url: 'https://github.com/player/game/issues/42' }
    throw new Error(`Unexpected GitHub request: ${path}`)
  }
  return { calls, requestGithub }
}

test('install the pinned action, add the OpenCode label, and create a remix issue', async () => {
  const mock = githubMock()
  const result = await remixRepository({
    owner: 'player',
    repo: 'game',
    prompt: 'Add a cooperative game mode',
    user: { login: 'player', token: 'user-token' },
    origin: 'https://omgithub.com',
    config: {},
    requestGithub: mock.requestGithub
  })

  assert.equal(result.issue.number, 42)
  assert.equal(result.workflowInstalled, true)
  const workflowWrite = mock.calls.find(call => call.method === 'PUT')
  const workflow = Buffer.from(JSON.parse(workflowWrite.body).content, 'base64').toString()
  assert.match(workflow, new RegExp(`opencode-prepare.yml@${workflowSha}`))
  assert.equal(JSON.parse(workflowWrite.body).branch, 'main')
  const issueWrite = mock.calls.find(call => call.path.endsWith('/issues'))
  assert.equal(JSON.parse(issueWrite.body).title, '/OpenCode Add a cooperative game mode')
  assert.equal(JSON.parse(issueWrite.body).body, 'Add a cooperative game mode')
  assert.deepEqual(JSON.parse(issueWrite.body).labels, ['OpenCode'])
  assert.equal(mock.calls.some(call => call.path.endsWith('/labels') && call.method === 'POST'), true)
})

test('clone a non-writable repository before installing the workflow', async () => {
  const mock = githubMock({ canWrite: false })

  let cloned = false
  const result = await remixRepository({
    owner: 'player',
    repo: 'game',
    prompt: 'Add a cooperative game mode',
    user: { login: 'player', token: 'user-token' },
    origin: 'https://omgithub.com',
    config: {},
    requestGithub: mock.requestGithub,
    cloneRepository: async () => { cloned = true; return { full_name: 'player/game', default_branch: 'main', has_issues: true } }
  })

  assert.equal(cloned, true)
  assert.equal(result.issue.number, 42)
})

test('preserve long prompt branch directives and validate the selected branch', async () => {
  const mock = githubMock()
  const calls = []
  const prompt = 'Build ' + 'x'.repeat(12001) + ' branch: release'
  await remixRepository({ owner: 'player', repo: 'game', prompt, user: { token: 'test' }, config: {},
    requestGithub: async (path, token, options = {}) => {
      calls.push({ path, ...options })
      if (path.endsWith('/branches/release')) return {}
      return mock.requestGithub(path, token, options)
    } })
  assert.ok(calls.some(call => call.path.endsWith('/branches/release')))
  const issue = JSON.parse(calls.find(call => call.path.endsWith('/issues')).body)
  assert.match(issue.title, / branch: release$/)
  assert.equal(issue.body, prompt)
})

test('preserve central native caller and reject missing or incompatible callers', async () => {
  for (const content of ['types: [opened]\nuses: ./.github/workflows/opencode-prepare.yml\nuses: ./.github/workflows/opencode-reusable.yml', '', 'old caller']) {
    const calls = []
    const run = remixRepository({ owner: 'agentsloop', repo: 'ohmygithub', prompt: 'Build a maze game',
      user: { token: 'test' }, config: {}, requestGithub: async (path, token, options = {}) => {
        calls.push({ path, ...options })
        if (path === '/repos/agentsloop/ohmygithub') return { full_name: 'AgentsLoop/OhMyGithub', default_branch: 'main', permissions: { push: true } }
        if (path.includes('/commits/')) return { sha: workflowSha }
        if (path.endsWith('opencode.yml?ref=main')) return { sha: 'old', content: Buffer.from(content).toString('base64') }
        if (path.endsWith('/issues')) return { number: 4 }
        return {}
      } })
    if (content.startsWith('types:')) assert.equal((await run).workflowInstalled, false)
    else await assert.rejects(run, { status: 409 })
    assert.ok(!calls.some(call => call.method === 'PUT'))
    if (!content.startsWith('types:')) assert.ok(!calls.some(call => call.path.endsWith('/issues')))
  }
})
