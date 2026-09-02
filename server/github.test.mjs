import assert from 'node:assert/strict'
import test from 'node:test'
import { extractUrls } from './github.mjs'

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
