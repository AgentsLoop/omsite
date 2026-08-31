import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, generateKeyPairSync } from 'node:crypto'
import { dispatchOmgRequest, extractUrls, omgRequest, parseIssueRequest, repositoryWorkflow, slugify, verifyWebhookSignature } from './github.mjs'
test('extracts OpenCode, preview, PR and screenshots from issue comments', () => {
  const issue = { body: 'started' }, comments = [{ body: 'Live OpenCode: https://quiet-field.trycloudflare.com/work/session/ses_123' }, { body: 'Public game: https://bright-game.trycloudflare.com\nPR https://github.com/AgentsLoop/OhMyGithub/pull/96\n![shot](https://raw.githubusercontent.com/AgentsLoop/OhMyGithub/abc/project/screenshots/final-game.png)' }]
  const result = extractUrls(issue, comments)
  assert.match(result.opencode, /ses_123/); assert.equal(result.preview, 'https://bright-game.trycloudflare.com'); assert.match(result.pr, /pull\/96/); assert.equal(result.screenshots.length, 1)
})
test('normalizes a game name for subdomain allocation', () => assert.equal(slugify('Football Physics!'), 'football-physics'))
test('extracts a title-suffix branch directive without changing the request body', () => {
  assert.deepEqual(parseIssueRequest({ title: 'Custom branch smoke test branch: codex/omgithub-site', body: 'Build a tiny browser page.' }, 'main'), {
    request: 'Build a tiny browser page.', title: 'Custom branch smoke test', targetRef: 'codex/omgithub-site', branchSpecified: true, branchError: ''
  })
  assert.match(parseIssueRequest({ title: 'Build it branch: bad branch' }, 'main').branchError, /Invalid branch directive/)
  assert.equal(parseIssueRequest({ title: 'Fallback', body: 'Build on the default branch' }, 'main').targetRef, 'main')
})

const webhook = {
  action: 'opened', installation: { id: 42 }, sender: { login: 'octocat', type: 'User' },
  repository: { full_name: 'octo/example', default_branch: 'trunk' },
  issue: { number: 7, title: 'Build it', body: 'Build a tiny game', labels: [{ name: 'Goal' }, { name: 'OpenCode' }] }
}

test('normalizes an eligible OMG webhook request', () => {
  assert.deepEqual(omgRequest('issues', webhook), {
    owner: 'octo', repo: 'example', repository: 'octo/example', defaultBranch: 'trunk', installationId: 42,
    issueNumber: 7, issueTitle: 'Build it', request: 'Build a tiny game', targetRef: 'trunk', branchSpecified: false, branchError: '', deliveryEvent: 'issues',
    deliveryAction: 'opened', sender: 'octocat', labels: ['Goal', 'OpenCode'], missingOpenCodeLabel: false
  })
  assert.equal(omgRequest('issues', { ...webhook, sender: { type: 'Bot' } }), null)
  assert.equal(omgRequest('issue_comment', { ...webhook, action: 'created', comment: { body: 'Build it' } }), null)
  assert.equal(omgRequest('issues', { ...webhook, action: 'edited' }), null)
  const missingLabelRequest = omgRequest('issues', { ...webhook, issue: { ...webhook.issue, labels: [{ name: 'Goal' }] } })
  assert.equal(missingLabelRequest.missingOpenCodeLabel, true)
  const labeledRequest = omgRequest('issues', { ...webhook, action: 'labeled', label: { name: 'OpenCode' } })
  assert.equal(labeledRequest.request, 'Build a tiny game')
  assert.equal(omgRequest('issues', { ...webhook, action: 'labeled', label: { name: 'Goal' } }), null)
})

test('comments on newly opened issues missing the OpenCode label without dispatching', async () => {
  const calls = []
  const request = omgRequest('issues', { ...webhook, issue: { ...webhook.issue, labels: [{ name: 'Goal' }] } })
  const result = await dispatchOmgRequest(request, dispatchConfig(), async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/access_tokens')) return response(201, { token: 'installation-token', permissions: requiredPermissions })
    if (url.endsWith('/issues/7/comments')) return response(201)
    return response(500)
  })
  assert.deepEqual(result, { route: 'missing-opencode-label', repository: 'octo/example', commented: true })
  assert.equal(calls.some(call => call.url.includes('/actions/workflows/')), false)
  const comment = calls.find(call => call.url.endsWith('/issues/7/comments'))
  assert.match(JSON.parse(comment.options.body).body, /Please add the `OpenCode` label/)
})

test('verifies webhook signatures without accepting malformed signatures', () => {
  const body = Buffer.from('{"ok":true}')
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`
  assert.equal(verifyWebhookSignature(body, signature, 'secret'), true)
  assert.equal(verifyWebhookSignature(body, 'sha256=bad', 'secret'), false)
})

function response(status, data = {}) { return { ok: status >= 200 && status < 300, status, json: async () => data } }
const requiredPermissions = { actions: 'write', contents: 'write', issues: 'write', workflows: 'write' }
function dispatchConfig() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return { appId: 123, privateKey, fallbackOwner: 'AgentsLoop', fallbackRepo: 'OhMyGithub', fallbackRef: 'main' }
}

test('dispatches the repository-local workflow when it exists', async () => {
  const calls = []
  const result = await dispatchOmgRequest(omgRequest('issues', webhook), dispatchConfig(), async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/access_tokens')) return response(201, { token: 'installation-token', permissions: requiredPermissions })
    if (url.includes('/contents/')) return response(200)
    return response(204)
  })
  assert.equal(result.route, 'local')
  assert.match(calls.at(-1).url, /octo\/example\/actions\/workflows\/opencode\.yml\/dispatches$/)
  assert.equal(JSON.parse(calls.at(-1).options.body).ref, 'trunk')
  assert.equal('target_ref' in JSON.parse(calls.at(-1).options.body).inputs, false)
  assert.equal(calls.at(-1).options.headers.authorization, 'Bearer installation-token')
})

test('bootstraps and dispatches a local wrapper when the target has no workflow', async () => {
  const calls = []
  const result = await dispatchOmgRequest(omgRequest('issues', webhook), dispatchConfig(), async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/access_tokens')) return response(201, { token: 'installation-token', permissions: requiredPermissions })
    if (url.includes('/contents/') && options.method !== 'PUT') return response(404)
    if (url.includes('/contents/') && options.method === 'PUT') return response(201)
    return response(204)
  })
  assert.equal(result.route, 'bootstrapped')
  const create = calls.at(-2), dispatch = calls.at(-1)
  assert.equal(create.options.method, 'PUT')
  assert.equal(create.options.headers.authorization, 'Bearer installation-token')
  assert.match(Buffer.from(JSON.parse(create.options.body).content, 'base64').toString(), /uses: AgentsLoop\/OhMyGithub\/.github\/workflows\/opencode-reusable.yml@main/)
  assert.match(dispatch.url, /octo\/example\/actions\/workflows\/opencode\.yml\/dispatches$/)
  assert.equal(dispatch.options.headers.authorization, 'Bearer installation-token')
  assert.equal(JSON.parse(dispatch.options.body).ref, 'trunk')
})

test('validates and forwards a custom issue branch without including metadata in the prompt', async () => {
  const calls = []
  const branchWebhook = {
    ...webhook,
    issue: { ...webhook.issue, title: 'Custom branch smoke test branch: codex/omgithub-site', body: 'Build a tiny browser page.' }
  }
  const result = await dispatchOmgRequest(omgRequest('issues', branchWebhook), dispatchConfig(), async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/access_tokens')) return response(201, { token: 'installation-token', permissions: requiredPermissions })
    if (url.includes('/branches/codex%2Fomgithub-site')) return response(200)
    if (url.includes('/contents/')) return response(200)
    return response(204)
  })
  assert.equal(result.route, 'local')
  const dispatch = calls.at(-1)
  const payload = JSON.parse(dispatch.options.body)
  assert.equal(calls.some(call => call.url.includes('/contents/.github/workflows/opencode.yml?ref=codex%2Fomgithub-site')), true)
  assert.equal(payload.ref, 'codex/omgithub-site')
  assert.equal('target_ref' in payload.inputs, false)
  assert.equal(payload.inputs.request, 'Build a tiny browser page.')
  assert.equal(payload.inputs.issue_title, 'Custom branch smoke test')
})

test('comments and skips dispatch when a requested branch does not exist', async () => {
  const calls = []
  const branchWebhook = {
    ...webhook,
    issue: { ...webhook.issue, title: 'Build it branch: missing/ref' }
  }
  const result = await dispatchOmgRequest(omgRequest('issues', branchWebhook), dispatchConfig(), async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/access_tokens')) return response(201, { token: 'installation-token', permissions: requiredPermissions })
    if (url.includes('/branches/missing%2Fref')) return response(404)
    if (url.endsWith('/issues/7/comments')) return response(201)
    return response(500)
  })
  assert.equal(result.route, 'invalid-branch')
  assert.equal(result.commented, true)
  assert.equal(calls.some(call => call.url.includes('/actions/workflows/')), false)
})

test('comments on the issue and skips dispatch when installation permissions are missing', async () => {
  const calls = []
  const result = await dispatchOmgRequest(omgRequest('issues', webhook), dispatchConfig(), async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/access_tokens')) {
      return response(201, { token: 'installation-token', permissions: { ...requiredPermissions, workflows: 'read' } })
    }
    if (url.endsWith('/issues/7/comments')) return response(201)
    return response(500)
  })
  assert.deepEqual(result, {
    route: 'permissions-missing', repository: 'octo/example',
    missingPermissions: ['workflows: write'], commented: true
  })
  assert.equal(calls.some(call => call.url.includes('/actions/workflows/')), false)
  const comment = calls.find(call => call.url.endsWith('/issues/7/comments'))
  assert.match(JSON.parse(comment.options.body).body, /workflows: write/)
})

test('uses the notification token when the installation cannot comment', async () => {
  const calls = []
  const config = { ...dispatchConfig(), notificationToken: 'service-token' }
  const result = await dispatchOmgRequest(omgRequest('issues', webhook), config, async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/access_tokens')) {
      return response(201, { token: 'installation-token', permissions: { ...requiredPermissions, issues: 'read' } })
    }
    if (url.endsWith('/issues/7/comments') && options.headers.authorization === 'Bearer service-token') return response(201)
    if (url.endsWith('/issues/7/comments')) return response(403)
    return response(500)
  })
  assert.equal(result.route, 'permissions-missing')
  assert.equal(result.commented, true)
  assert.deepEqual(result.missingPermissions, ['issues: write'])
  assert.equal(calls.at(-1).options.headers.authorization, 'Bearer service-token')
})

test('repository wrapper uses the workflow dispatch branch', () => {
  const workflow = repositoryWorkflow()
  assert.doesNotMatch(workflow, /target_ref/)
  assert.doesNotMatch(workflow, /target_repository|use_app_token|installation_id/)
})
