import assert from 'node:assert/strict'
import test from 'node:test'
import { ensurePagesEnvironment, ensureWorkflowPullRequests, extractUrls, repositoryWorkflow } from './github.mjs'

test('extractUrls separates OpenCode, screenshots, preview, and Pages result', () => {
  const result = extractUrls(
    { body: 'Build requested' },
    [{ body: [
      'OpenCode: https://chat.trycloudflare.com/session/ses_123',
      'Progress: ![shot](https://github.com/user-attachments/assets/abc-123)',
      'Preview: https://game.trycloudflare.com',
      'Published: https://agentsloop.github.io/example/branches/opencode-1/abc123/'
    ].join('\n') }]
  )

  assert.equal(result.opencode, 'https://chat.trycloudflare.com/session/ses_123')
  assert.equal(result.preview, 'https://game.trycloudflare.com')
  assert.equal(result.published, 'https://agentsloop.github.io/example/branches/opencode-1/abc123/')
  assert.deepEqual(result.screenshots, ['https://github.com/user-attachments/assets/abc-123'])
})

test('ensurePagesEnvironment creates github-pages and allows the default branch', async () => {
  const calls = []
  const requestFetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (options.method === 'PUT') return { ok: true, status: 200 }
    if (options.method === 'POST') return { ok: true, status: 201 }
    return { ok: true, status: 200, json: async () => ({ branch_policies: [{ name: 'gh-pages', type: 'branch' }] }) }
  }

  const created = await ensurePagesEnvironment('agents-dev', 'new-game', 'master', 'token', 'https://api.example.test', {}, requestFetch)

  assert.equal(created, true)
  assert.equal(calls.length, 3)
  assert.match(calls[0].url, /\/environments\/github-pages$/)
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
  })
  assert.match(calls[1].url, /\/deployment-branch-policies$/)
  assert.deepEqual(JSON.parse(calls[2].options.body), { name: 'master', type: 'branch' })
})

test('ensurePagesEnvironment is idempotent when the default branch is already allowed', async () => {
  const methods = []
  const requestFetch = async (url, options = {}) => {
    methods.push(options.method || 'GET')
    if (options.method === 'PUT') return { ok: true, status: 200 }
    return { ok: true, status: 200, json: async () => ({ branch_policies: [{ name: 'main', type: 'branch' }] }) }
  }

  const created = await ensurePagesEnvironment('agents-dev', 'existing-game', 'main', 'token', 'https://api.example.test', {}, requestFetch)

  assert.equal(created, false)
  assert.deepEqual(methods, ['PUT', 'GET'])
})

test('repositoryWorkflow passes the Pages publishing switch to the reusable workflow', () => {
  const workflow = repositoryWorkflow()

  assert.match(workflow, /pages_publish_enabled: \$\{\{ inputs\.pages_publish_enabled \}\}/)
})

test('ensureWorkflowPullRequests enables write permissions for Actions PR delivery', async () => {
  let call
  const enabled = await ensureWorkflowPullRequests('agents-dev', 'new-game', 'token', 'https://api.example.test', {}, async (url, options) => {
    call = { url, options }
    return { ok: true, status: 204 }
  })

  assert.equal(enabled, true)
  assert.match(call.url, /\/actions\/permissions\/workflow$/)
  assert.deepEqual(JSON.parse(call.options.body), {
    default_workflow_permissions: 'write',
    can_approve_pull_request_reviews: true
  })
})
