import assert from 'node:assert/strict'
import test from 'node:test'
import { extractUrls, repositoryWorkflow } from './github.mjs'

test('extractUrls separates OpenCode, screenshots, preview, and immutable project URL', () => {
  const sha = 'a'.repeat(40)
  const result = extractUrls(
    { body: 'Build requested' },
    [{ body: [
      'OpenCode: https://chat.trycloudflare.com/session/ses_123',
      'Progress: ![shot](https://github.com/user-attachments/assets/abc-123)',
      'Preview: https://game.trycloudflare.com',
      `Open: https://omgithub.com/owner/repo/tree/${sha}`
    ].join('\n') }]
  )

  assert.equal(result.opencode, 'https://chat.trycloudflare.com/session/ses_123')
  assert.equal(result.preview, 'https://game.trycloudflare.com')
  assert.equal(result.project, `https://omgithub.com/owner/repo/tree/${sha}`)
  assert.deepEqual(result.screenshots, ['https://github.com/user-attachments/assets/abc-123'])
})

test('repositoryWorkflow needs no external publication configuration', () => {
  const workflow = repositoryWorkflow()

  assert.doesNotMatch(workflow, /publish_enabled|deployment_token/i)
})
