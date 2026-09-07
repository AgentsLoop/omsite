import assert from 'node:assert/strict'
import test from 'node:test'
import { ensureWorkflowPullRequests, extractUrls, repositoryWorkflow } from './github.mjs'

test('extractUrls separates OpenCode, screenshots, preview, and Vercel result', () => {
  const result = extractUrls(
    { body: 'Build requested' },
    [{ body: [
      'OpenCode: https://chat.trycloudflare.com/session/ses_123',
      'Progress: ![shot](https://github.com/user-attachments/assets/abc-123)',
      'Preview: https://game.trycloudflare.com',
      'Published: https://example-project.vercel.app'
    ].join('\n') }]
  )

  assert.equal(result.opencode, 'https://chat.trycloudflare.com/session/ses_123')
  assert.equal(result.preview, 'https://game.trycloudflare.com')
  assert.equal(result.published, 'https://example-project.vercel.app')
  assert.deepEqual(result.screenshots, ['https://github.com/user-attachments/assets/abc-123'])
})

test('repositoryWorkflow passes the Vercel publishing switch and token to the reusable workflow', () => {
  const workflow = repositoryWorkflow()

  assert.match(workflow, /vercel_publish_enabled: \$\{\{ inputs\.vercel_publish_enabled \}\}/)
  assert.match(workflow, /VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}/)
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
