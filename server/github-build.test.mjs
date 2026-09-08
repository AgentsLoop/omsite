import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchPublicBuild } from './github-build.mjs'

function response(data, { status = 200 } = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => String(body),
    arrayBuffer: async () => Buffer.from(body)
  }
}

test('dispatches a repository build for direct ZIP upload', async () => {
  let requestId = ''
  const calls = []
  const requestFetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/dispatches')) {
      const inputs = JSON.parse(options.body).inputs
      requestId = inputs.request_id
      assert.equal(inputs.upload_url, 'https://omgithub.com/api/builds')
      assert.equal(inputs.upload_token, 'upload-secret')
      return response('', { status: 204 })
    }
    if (url.includes('/runs?')) return response({ workflow_runs: [{ id: 42, status: 'completed', conclusion: 'success', display_title: `OmGithub build ${requestId}` }] })
    return response({ message: 'not found' }, { status: 404 })
  }

  const result = await dispatchPublicBuild({ sourceOwner: 'owner', sourceRepo: 'repo', sourceSha: 'a'.repeat(40), workflowOwner: 'AgentsLoop', workflowRepo: 'OhMyGithub', token: 'secret', uploadUrl: 'https://omgithub.com/api/builds', uploadToken: 'upload-secret', requestFetch, pollMs: 0 })

  assert.equal(result.run.id, 42)
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret')
})
