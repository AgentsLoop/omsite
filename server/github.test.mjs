import assert from 'node:assert/strict'
import test from 'node:test'
import { generateKeyPairSync } from 'node:crypto'
import { ensureIssueWorkflow, setupRepositories, extractUrls, repositoryWorkflow } from './github.mjs'

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
  const workflow = repositoryWorkflow('AgentsLoop', 'OhMyGithub', 'a'.repeat(40))

  assert.doesNotMatch(workflow, /publish_enabled|deployment_token/i)
})

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const config = { appId: 42, privateKey, fallbackOwner: 'central', fallbackRepo: 'runtime', fallbackRef: 'release' }
const sha = 'b'.repeat(40)
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data })

function repositoryMock(existing = null) {
  const calls = []
  let stored = existing
  const requestFetch = async (url, options = {}) => {
    const path = new URL(url).pathname
    calls.push({ path, url, ...options })
    if (path.endsWith('/installation')) return response({ id: 9 })
    if (path.endsWith('/access_tokens')) return response({ token: 'installation-token', permissions: { actions: 'write', contents: 'write', issues: 'write', workflows: 'write' } })
    if (path === '/repos/user/project') return response({ full_name: 'user/project', default_branch: 'trunk' })
    if (path.endsWith('/commits/release')) return response({ sha })
    if (path.startsWith('/repos/central/runtime/contents/')) return response({ content: 'checked' })
    if (path.endsWith('/contents/.github/workflows/opencode.yml')) {
      if (options.method === 'PUT') { stored = JSON.parse(options.body).content; return response({}) }
      return stored ? response({ content: stored, sha: 'old-file-sha' }) : response({}, 404)
    }
    if (path.endsWith('/labels/OpenCode')) return response({ name: 'OpenCode' })
    if (path.endsWith('/comments')) return response({ id: 1 }, 201)
    throw new Error(`Unexpected API call ${path}`)
  }
  return { calls, requestFetch }
}

test('native wrapper isolates validation and passes every validated execution input', () => {
  const workflow = repositoryWorkflow('central', 'runtime', sha)
  assert.match(workflow, /types: \[opened, labeled\]/)
  assert.match(workflow, /if: github.event.label.name == 'OpenCode'/)
  assert.doesNotMatch(workflow, /workflow_dispatch|dispatches|secrets: inherit/)
  const prepare = workflow.split('  prepare:')[1].split('  opencode:')[0]
  assert.doesNotMatch(prepare, /secrets/)
  assert.match(prepare, /OPENCODE_ACCESS == 'everyone'/)
  assert.match(prepare, /\/OpenCode/)
  assert.match(prepare, new RegExp(`runtime_ref: ${sha}`))
  assert.match(workflow, /if: needs.prepare.outputs.approved == 'true'/)
  for (const input of ['issue_number', 'request', 'issue_title', 'sender', 'labels_json', 'target_ref', 'target_sha']) {
    assert.ok(workflow.includes(`${input}: \${{ needs.prepare.outputs.${input} }}`))
  }
  assert.throws(() => repositoryWorkflow('central', 'runtime', 'main'), /immutable/)
})

test('install and verify listener on repository default branch at resolved central SHA', async () => {
  const mock = repositoryMock()
  const result = await ensureIssueWorkflow({ owner: 'user', repo: 'project' }, config, mock.requestFetch)
  assert.equal(result.installed, true)
  assert.equal(result.workflowSha, sha)
  assert.equal(result.installationToken, 'installation-token')
  const writes = mock.calls.filter(call => call.method === 'PUT')
  assert.equal(writes.length, 1)
  assert.equal(JSON.parse(writes[0].body).branch, 'trunk')
  assert.match(Buffer.from(JSON.parse(writes[0].body).content, 'base64').toString(), new RegExp(`opencode-prepare.yml@${sha}`))
  assert.equal(mock.calls.at(-1).url.endsWith('?ref=trunk'), true)
})

test('verify existing listener without a new commit', async () => {
  const mock = repositoryMock(Buffer.from(repositoryWorkflow('central', 'runtime', sha)).toString('base64'))
  assert.equal((await ensureIssueWorkflow({ owner: 'user', repo: 'project' }, config, mock.requestFetch)).installed, false)
  assert.equal(mock.calls.some(call => call.method === 'PUT'), false)
})

test('migrate existing caller with file SHA to prevent overwriting concurrent updates', async () => {
  const mock = repositoryMock(Buffer.from('old caller').toString('base64'))
  await ensureIssueWorkflow({ owner: 'user', repo: 'project' }, config, mock.requestFetch)
  assert.equal(JSON.parse(mock.calls.find(call => call.method === 'PUT').body).sha, 'old-file-sha')
})

test('only installation events request setup', () => {
  const payload = { installation: { id: 9 }, action: 'created', repositories: [{ full_name: 'user/project' }] }
  assert.deepEqual(setupRepositories('installation', payload), [{ owner: 'user', repo: 'project' }])
  assert.deepEqual(setupRepositories('installation_repositories', { ...payload, action: 'added', repositories_added: payload.repositories }), [{ owner: 'user', repo: 'project' }])
  assert.deepEqual(setupRepositories('issues', { ...payload, action: 'opened' }), [])
  assert.deepEqual(setupRepositories('issues', { ...payload, action: 'labeled' }), [])
})

test('setup creates the execution label without any issue interaction', async () => {
  const mock = repositoryMock()
  await ensureIssueWorkflow({ owner: 'user', repo: 'project' }, config, mock.requestFetch)
  assert.equal(mock.calls.some(call => call.path.endsWith('/labels/OpenCode')), true)
  assert.equal(mock.calls.some(call => call.path.includes('/issues/')), false)
})
