import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, generateKeyPairSync } from 'node:crypto'
import { dispatchOmgRequest, extractUrls, omgRequest, slugify, verifyWebhookSignature } from './github.mjs'
test('extracts OpenCode, preview, PR and screenshots from issue comments', () => {
  const issue = { body: 'started' }, comments = [{ body: 'Live OpenCode: https://quiet-field.trycloudflare.com/work/session/ses_123' }, { body: 'Public game: https://bright-game.trycloudflare.com\nPR https://github.com/agents-dev/aiplay/pull/96\n![shot](https://raw.githubusercontent.com/agents-dev/aiplay/abc/project/screenshots/final-game.png)' }]
  const result = extractUrls(issue, comments)
  assert.match(result.opencode, /ses_123/); assert.equal(result.preview, 'https://bright-game.trycloudflare.com'); assert.match(result.pr, /pull\/96/); assert.equal(result.screenshots.length, 1)
})
test('normalizes a game name for subdomain allocation', () => assert.equal(slugify('Football Physics!'), 'football-physics'))

const webhook = {
  action: 'created', installation: { id: 42 }, sender: { login: 'octocat', type: 'User' },
  repository: { full_name: 'octo/example', default_branch: 'trunk' },
  issue: { number: 7, title: 'Build it', body: 'details', labels: [{ name: 'Goal' }] },
  comment: { body: '/omg build a tiny game' }
}

test('normalizes an eligible OMG webhook request', () => {
  assert.deepEqual(omgRequest('issue_comment', webhook), {
    owner: 'octo', repo: 'example', repository: 'octo/example', defaultBranch: 'trunk', installationId: 42,
    issueNumber: 7, issueTitle: 'Build it', request: '/omg build a tiny game', deliveryEvent: 'issue_comment',
    deliveryAction: 'created', sender: 'octocat', labels: ['Goal']
  })
  assert.equal(omgRequest('issue_comment', { ...webhook, sender: { type: 'Bot' } }), null)
  assert.equal(omgRequest('issue_comment', { ...webhook, comment: { body: 'nothing to do' } }), null)
  const issueRequest = omgRequest('issues', { ...webhook, action: 'opened', issue: { ...webhook.issue, title: '/omg title request', body: 'context only' } })
  assert.equal(issueRequest.request, '/omg title request')
})

test('verifies webhook signatures without accepting malformed signatures', () => {
  const body = Buffer.from('{"ok":true}')
  const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`
  assert.equal(verifyWebhookSignature(body, signature, 'secret'), true)
  assert.equal(verifyWebhookSignature(body, 'sha256=bad', 'secret'), false)
})

function response(status, data = {}) { return { ok: status >= 200 && status < 300, status, json: async () => data } }
function dispatchConfig() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return { appId: 123, privateKey, fallbackOwner: 'Issuefy', fallbackRepo: 'OhMyGithub', fallbackWorkflow: 'opencode.yml', fallbackToken: 'central-token' }
}

test('dispatches the repository-local workflow when it exists', async () => {
  const calls = []
  const result = await dispatchOmgRequest(omgRequest('issue_comment', webhook), dispatchConfig(), async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/access_tokens')) return response(201, { token: 'installation-token' })
    if (url.includes('/contents/')) return response(200)
    return response(204)
  })
  assert.equal(result.route, 'local')
  assert.match(calls.at(-1).url, /octo\/example\/actions\/workflows\/opencode\.yml\/dispatches$/)
  assert.equal(JSON.parse(calls.at(-1).options.body).ref, 'trunk')
  assert.equal(calls.at(-1).options.headers.authorization, 'Bearer installation-token')
})

test('dispatches the centralized fallback when the target has no workflow', async () => {
  const calls = []
  const result = await dispatchOmgRequest(omgRequest('issue_comment', webhook), dispatchConfig(), async (url, options = {}) => {
    calls.push({ url, options })
    if (url.includes('/access_tokens')) return response(201, { token: 'installation-token' })
    if (url.includes('/contents/')) return response(404)
    return response(204)
  })
  assert.equal(result.route, 'fallback')
  const last = calls.at(-1), body = JSON.parse(last.options.body)
  assert.match(last.url, /Issuefy\/OhMyGithub\/actions\/workflows\/opencode\.yml\/dispatches$/)
  assert.equal(last.options.headers.authorization, 'Bearer central-token')
  assert.equal(body.inputs.target_repository, 'octo/example')
  assert.equal(body.inputs.target_owner, 'octo')
  assert.equal(body.inputs.target_repo, 'example')
  assert.equal(body.inputs.installation_id, '42')
})
