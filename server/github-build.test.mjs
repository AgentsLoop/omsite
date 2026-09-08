import assert from 'node:assert/strict'
import test from 'node:test'
import AdmZip from 'adm-zip'
import { buildPublicProject } from './github-build.mjs'

function response(data, { status = 200 } = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => String(body),
    arrayBuffer: async () => Buffer.from(body)
  }
}

test('dispatches a repository build and downloads its artifact', async () => {
  const zip = new AdmZip()
  zip.addFile('index.html', Buffer.from('<title>Built</title>'))
  let requestId = ''
  const calls = []
  const requestFetch = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/dispatches')) {
      requestId = JSON.parse(options.body).inputs.request_id
      return response('', { status: 204 })
    }
    if (url.includes('/runs?')) return response({ workflow_runs: [{ id: 42, status: 'completed', conclusion: 'success', display_title: `OmGithub build ${requestId}` }] })
    if (url.endsWith('/artifacts?per_page=100')) return response({ artifacts: [{ name: 'omgithub-build-42', expired: false, archive_download_url: 'https://artifact.test/download' }] })
    if (url === 'https://artifact.test/download') return response(zip.toBuffer())
    return response({ message: 'not found' }, { status: 404 })
  }

  const result = await buildPublicProject({ sourceOwner: 'owner', sourceRepo: 'repo', sourceSha: 'a'.repeat(40), workflowOwner: 'AgentsLoop', workflowRepo: 'OhMyGithub', token: 'secret', requestFetch, pollMs: 0 })

  assert.equal(result.run.id, 42)
  assert.equal(result.artifact.name, 'omgithub-build-42')
  assert.equal(Buffer.from(result.buffer).equals(zip.toBuffer()), true)
  assert.equal(calls[0].options.headers.authorization, 'Bearer secret')
})
