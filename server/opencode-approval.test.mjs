import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createSign } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createExecutionStore, approveExecution, prepareExecution, verifyActionsToken } from './opencode-approval.mjs'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256' }
const claims = extra => ({ iss: 'https://token.actions.githubusercontent.com', aud: 'https://omgithub.com/api/opencode/prepare', nbf: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 300, repository: 'owner/repo', repository_id: '22', workflow_ref: 'owner/repo/.github/workflows/opencode.yml@refs/heads/main', ref: 'refs/heads/main', run_id: '100', run_attempt: '1', event_name: 'issues', ...extra })
function token(extra = {}) {
  const unsigned = [ { alg: 'RS256', kid: 'test-key' }, claims(extra) ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
  return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url')}`
}
function fixture(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'opencode-approval-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = createExecutionStore(dir)
  const issue = { number: 7, title: 'Build a game branch: feature', body: 'Make it playable', labels: [{ name: 'OpenCode' }, { name: 'Goal' }], user: { id: 50, login: 'human', type: 'User' }, updated_at: '2026-09-09T00:00:00Z', state: 'open' }
  const event = { action: 'labeled', label: { name: 'OpenCode' }, repository: { full_name: 'owner/repo', id: 22 }, sender: { id: 50 }, issue }
  const run = { id: 100, run_attempt: 1, repository: { id: 22 }, event: 'issues', path: '.github/workflows/opencode.yml', created_at: '2026-09-09T00:00:01Z', status: 'in_progress', conclusion: null }
  const timeline = [{ id: 999, event: 'labeled', label: { name: 'OpenCode' }, actor: { id: 50 }, created_at: issue.updated_at }]
  const fetcher = async url => {
    const path = new URL(url).pathname
    let data
    if (url.includes('/.well-known/jwks')) data = { keys: [jwk] }
    else if (path.endsWith('/installation')) data = { id: 1 }
    else if (path.endsWith('/access_tokens')) data = { token: 'installation-token' }
    else if (path === '/repos/owner/repo') data = { id: 22, default_branch: 'main' }
    else if (path.includes('/actions/runs/')) data = options.runs?.[path] || run
    else if (path.endsWith('/timeline')) data = timeline
    else if (path.endsWith('/issues/7')) data = options.currentIssue || issue
    else if (path.includes('/collaborators/')) data = { permission: options.permission || 'write' }
    else if (path.includes('/branches/')) data = { commit: { sha: 'a'.repeat(40) } }
    else throw new Error(`Unexpected request ${url}`)
    return { ok: true, json: async () => data }
  }
  return { dir, store, event, run, timeline, fetcher, config: { store, appId: 1, privateKey }, prepare: (extra = {}) => prepareExecution({ token: token(extra), event }, { store, appId: 1, privateKey }, fetcher) }
}

test('verify real RSA signature and reject wrong audience, expiry and workflow identity', async t => {
  const f = fixture(t)
  await assert.rejects(verifyActionsToken(token({ aud: 'other' }), 'https://omgithub.com/api/opencode/prepare', f.fetcher), /scoped/)
  await assert.rejects(f.prepare({ exp: 1 }), /Expired/)
  await assert.rejects(f.prepare({ workflow_ref: 'owner/repo/.github/workflows/other.yml@refs/heads/main' }), /default branch/)
  const signed = token().split('.')
  signed[1] = Buffer.from(JSON.stringify(claims({ repository: 'evil/repo' }))).toString('base64url')
  await assert.rejects(verifyActionsToken(signed.join('.'), 'https://omgithub.com/api/opencode/prepare', f.fetcher), /signature/)
})

test('freeze authorized request, resolve branch SHA and persist duplicate claim across store restart', async t => {
  const f = fixture(t)
  const result = await f.prepare()
  assert.deepEqual(result, { approved: 'true', issue_number: '7', issue_title: 'Build a game', request: 'Make it playable', labels_json: '["Goal","OpenCode"]', sender: 'human', target_ref: 'feature', target_sha: 'a'.repeat(40) })
  f.config.store = createExecutionStore(f.dir)
  await assert.rejects(prepareExecution({ token: token(), event: f.event }, f.config, f.fetcher), /active execution/)
})

test('reject bypassed App approval, accept approved human, reject later edits', async t => {
  const f = fixture(t)
  f.event.issue.user = { id: 90, login: 'app[bot]', type: 'Bot' }
  await assert.rejects(f.prepare(), /no matching approval/)
  await approveExecution(f.store, { repository: 'owner/repo', issue: f.event.issue, defaultBranch: 'main', sender: 'human' })
  f.event.issue.body = 'Changed request'
  await assert.rejects(f.prepare(), /no matching approval/)
  f.event.issue.body = 'Make it playable'
  assert.equal((await f.prepare()).sender, 'human')
})

test('reject unauthorized human author even if label actor can write', async t => {
  const f = fixture(t, { permission: 'read' })
  await assert.rejects(f.prepare(), /needs write/)
})

test('reject edited snapshot and ambiguous originating label event', async t => {
  const f = fixture(t, { currentIssue: { title: 'Edited', body: 'new', labels: [] } })
  await assert.rejects(f.prepare(), /changed/)
  const g = fixture(t)
  g.timeline.push({ ...g.timeline[0], id: 1000 })
  await assert.rejects(g.prepare(), /uniquely/)
})

test('reject completed request and permit only increased attempt of failed run', async t => {
  const options = { runs: {} }
  const f = fixture(t, options)
  await f.prepare()
  f.run.status = 'completed'; f.run.conclusion = 'success'
  await assert.rejects(f.prepare(), /already claimed/)
  f.run.conclusion = 'failure'
  options.currentIssue = { ...f.event.issue, labels: [...f.event.issue.labels, { name: 'failed' }] }
  options.runs['/repos/owner/repo/actions/runs/100/attempts/2'] = { ...f.run, run_attempt: 2, status: 'in_progress', conclusion: null }
  assert.equal((await f.prepare({ run_attempt: '2' })).approved, 'true')
})

test('reject new relabel during active execution; allow it after completion', async t => {
  const options = { runs: {} }
  const f = fixture(t, options)
  await f.prepare()
  f.timeline[0].id = 1000
  options.runs['/repos/owner/repo/actions/runs/101/attempts/1'] = { ...f.run, id: 101 }
  await assert.rejects(f.prepare({ run_id: '101' }), /active execution/)
  f.run.status = 'completed'; f.run.conclusion = 'success'; f.run.updated_at = '2026-09-09T00:01:00Z'
  await assert.rejects(f.prepare({ run_id: '101' }), /submitted during/)
  f.event.issue.updated_at = '2026-09-09T00:02:00Z'
  f.timeline[0].created_at = f.event.issue.updated_at
  options.runs['/repos/owner/repo/actions/runs/101/attempts/1'].created_at = '2026-09-09T00:02:01Z'
  assert.equal((await f.prepare({ run_id: '101' })).approved, 'true')
})

test('serialize concurrent claims so only one preparation succeeds', async t => {
  const f = fixture(t)
  const results = await Promise.allSettled([f.prepare(), f.prepare()])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
})
