import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchPublicBuild, normalizeBuildRunner } from '../lib/github-build.mjs'

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
  const statuses = []
  const requestFetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/dispatches')) {
      const inputs = JSON.parse(options.body).inputs
      requestId = inputs.request_id
      assert.equal(inputs.source_path, '')
      assert.equal(inputs.source_entry, '')
      assert.equal(inputs.build_runner, 'ubuntu-latest')
      assert.equal(inputs.upload_url, 'https://omgithub.com/api/builds')
      assert.equal(inputs.upload_token, 'upload-secret')
      return response('', { status: 204 })
    }
    if (url.includes('/runs?')) return response({ workflow_runs: [{ id: 42, status: 'completed', conclusion: 'success', display_title: `OmGithub build ${requestId}` }] })
    return response({ message: 'not found' }, { status: 404 })
  }

  const result = await dispatchPublicBuild({ sourceOwner: 'owner', sourceRepo: 'repo', sourceSha: 'a'.repeat(40), workflowOwner: 'AgentsLoop', workflowRepo: 'OhMyGithub', token: 'secret', uploadUrl: 'https://omgithub.com/api/builds', uploadToken: 'upload-secret', onStatus: status => statuses.push(status), requestFetch, pollMs: 0 })

  assert.equal(result.run.id, 42)
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret')
  assert.deepEqual(statuses, [{ phase: 'queued' }, { phase: 'publishing', runId: '42' }])
})

test('dispatches a build on the selected macOS runner', async () => {
  let requestId = ''
  const requestFetch = async (url, options = {}) => {
    if (url.endsWith('/dispatches')) {
      const inputs = JSON.parse(options.body).inputs
      requestId = inputs.request_id
      assert.equal(inputs.build_runner, 'macos-latest')
      return response('', { status: 204 })
    }
    if (url.includes('/runs?')) return response({ workflow_runs: [{ id: 45, status: 'completed', conclusion: 'success', display_title: `OmGithub build ${requestId}` }] })
    return response({ message: 'not found' }, { status: 404 })
  }

  const result = await dispatchPublicBuild({ sourceOwner: 'owner', sourceRepo: 'repo', sourceSha: 'd'.repeat(40), buildRunner: 'mac-latest', workflowOwner: 'AgentsLoop', workflowRepo: 'OhMyGithub', token: 'secret', uploadUrl: 'https://omgithub.com/api/builds', uploadToken: 'upload-secret', requestFetch, pollMs: 0 })

  assert.equal(result.run.id, 45)
  assert.equal(normalizeBuildRunner('mac-latest'), 'macos-latest')
  assert.throws(() => normalizeBuildRunner('self-hosted'), /must be/)
})

test('dispatches a selected repository subdirectory to the build workflow', async () => {
  let requestId = ''
  const requestFetch = async (url, options = {}) => {
    if (url.endsWith('/dispatches')) {
      const inputs = JSON.parse(options.body).inputs
      requestId = inputs.request_id
      assert.equal(inputs.source_path, 'games/balance-astronaut')
      assert.equal(inputs.source_entry, '')
      return response('', { status: 204 })
    }
    if (url.includes('/runs?')) return response({ workflow_runs: [{ id: 43, status: 'completed', conclusion: 'success', display_title: `OmGithub build ${requestId}` }] })
    return response({ message: 'not found' }, { status: 404 })
  }

  const result = await dispatchPublicBuild({ sourceOwner: 'owner', sourceRepo: 'repo', sourceSha: 'b'.repeat(40), sourcePath: 'games/balance-astronaut', workflowOwner: 'AgentsLoop', workflowRepo: 'OhMyGithub', token: 'secret', uploadUrl: 'https://omgithub.com/api/builds', uploadToken: 'upload-secret', requestFetch, pollMs: 0 })

  assert.equal(result.run.id, 43)
})

test('dispatches a selected HTML entry file', async () => {
  let requestId = ''
  const requestFetch = async (url, options = {}) => {
    if (url.endsWith('/dispatches')) {
      const inputs = JSON.parse(options.body).inputs
      requestId = inputs.request_id
      assert.equal(inputs.source_path, 'mosswing')
      assert.equal(inputs.source_entry, 'mosswing.html')
      return response('', { status: 204 })
    }
    if (url.includes('/runs?')) return response({ workflow_runs: [{ id: 44, status: 'completed', conclusion: 'success', display_title: `OmGithub build ${requestId}` }] })
    return response({ message: 'not found' }, { status: 404 })
  }

  const result = await dispatchPublicBuild({ sourceOwner: 'owner', sourceRepo: 'repo', sourceSha: 'c'.repeat(40), sourcePath: 'mosswing', sourceEntry: 'mosswing.html', workflowOwner: 'AgentsLoop', workflowRepo: 'OhMyGithub', token: 'secret', uploadUrl: 'https://omgithub.com/api/builds', uploadToken: 'upload-secret', requestFetch, pollMs: 0 })

  assert.equal(result.run.id, 44)
})
