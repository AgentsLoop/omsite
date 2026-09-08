import { createHash, createPublicKey, verify } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { appJwt, parseIssueRequest } from './github.mjs'

const ISSUER = 'https://token.actions.githubusercontent.com'
const deny = (message, status = 403) => { throw Object.assign(new Error(message), { status }) }
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const lifecycleLabels = new Set(['in progress', 'validating', 'complete', 'failed'])
const labels = issue => (issue.labels || []).map(label => typeof label === 'string' ? label : label.name).filter(name => !lifecycleLabels.has(name)).sort()
export const snapshotHash = (issue, targetRef) => hash({ title: issue.title || '', body: issue.body || '', labels: labels(issue), targetRef })

// Keep approval and claims in one issue document so issue-wide claims are atomic.
// Local storage supports a single machine with a persistent data directory.
export function createExecutionStore(dataDir, firestore = null) {
  const directory = join(dataDir, 'opencode-executions')
  if (!firestore) mkdirSync(directory, { recursive: true })
  const key = (repository, issue) => hash([repository.toLowerCase(), String(issue)])
  return {
    async read(repository, issue) {
      const id = key(repository, issue)
      if (firestore) return (await firestore.collection('opencode_executions').doc(id).get()).data() || { version: 0, claims: {} }
      try { return JSON.parse(readFileSync(join(directory, `${id}.json`), 'utf8')) } catch (error) { if (error.code === 'ENOENT') return { version: 0, claims: {} }; throw error }
    },
    async mutate(repository, issue, update) {
      const id = key(repository, issue)
      if (firestore) {
        const ref = firestore.collection('opencode_executions').doc(id)
        return firestore.runTransaction(async transaction => {
          const state = (await transaction.get(ref)).data() || { version: 0, claims: {} }
          const result = update(state)
          state.version += 1
          transaction.set(ref, state)
          return result
        })
      }
      const lock = join(directory, `${id}.lock`)
      // Fail closed during another process's write. Retry preparation explicitly.
      try { mkdirSync(lock) } catch (error) { if (error.code === 'EEXIST') deny('Request storage is busy; retry preparation.', 409); throw error }
      const file = join(directory, `${id}.json`)
      try {
        const state = await this.read(repository, issue)
        const result = update(state)
        state.version += 1
        writeFileSync(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 })
        renameSync(`${file}.tmp`, file)
        return result
      } finally { rmSync(lock, { recursive: true, force: true }) }
    }
  }
}

export async function approveExecution(store, { repository, issue, defaultBranch, sender }) {
  const parsed = parseIssueRequest(issue, defaultBranch)
  if (!sender || parsed.branchError || !parsed.request) deny(parsed.branchError || 'Missing approved human or request.')
  const approval = { sender, snapshot: snapshotHash(issue, parsed.targetRef), approvedAt: new Date().toISOString() }
  await store.mutate(repository, issue.number, state => { state.approval = approval })
  return approval
}

export async function verifyActionsToken(token, audience, requestFetch = fetch, now = Math.floor(Date.now() / 1000)) {
  let header, claims, signature, unsigned
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) deny('Invalid Actions identity token.')
    header = JSON.parse(Buffer.from(parts[0], 'base64url'))
    claims = JSON.parse(Buffer.from(parts[1], 'base64url'))
    signature = Buffer.from(parts[2], 'base64url'); unsigned = `${parts[0]}.${parts[1]}`
  } catch { deny('Invalid Actions identity token.') }
  if (header.alg !== 'RS256' || !header.kid) deny('Invalid Actions signing algorithm.')
  const response = await requestFetch(`${ISSUER}/.well-known/jwks`, { signal: AbortSignal.timeout(15000), redirect: 'error' })
  if (!response.ok) deny('Cannot verify Actions signing key.', 503)
  const jwk = (await response.json()).keys?.find(key => key.kid === header.kid && key.kty === 'RSA')
  if (!jwk || !verify('RSA-SHA256', Buffer.from(unsigned), createPublicKey({ key: jwk, format: 'jwk' }), signature)) deny('Invalid Actions token signature.')
  if (claims.iss !== ISSUER || claims.aud !== audience || !Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.nbf) || claims.nbf > now + 30) deny('Expired or incorrectly scoped Actions identity.')
  return claims
}

export async function prepareExecution({ token, event }, config, requestFetch = fetch) {
  const audience = `${(config.publicOrigin || 'https://omgithub.com').replace(/\/$/, '')}/api/opencode/prepare`
  const identity = await verifyActionsToken(token, audience, requestFetch)
  const repository = identity.repository
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || event?.repository?.full_name !== repository || String(event.repository.id) !== identity.repository_id) deny('Repository identity mismatch.')
  if (identity.event_name !== 'issues' || event.action !== 'labeled' || event.label?.name !== 'OpenCode' || event.issue?.pull_request || !labels(event.issue || {}).includes('OpenCode')) deny('Only OpenCode issue label events can execute.')
  if (!Number.isSafeInteger(event.issue.number) || event.issue.number < 1 || !/^\d+$/.test(identity.run_id || '') || !/^\d+$/.test(identity.run_attempt || '')) deny('Invalid issue or Actions run identity.')
  const common = { accept: 'application/vnd.github+json', 'user-agent': 'OmGithub', 'x-github-api-version': '2022-11-28' }
  const api = async (path, auth, options = {}) => {
    const response = await requestFetch(`https://api.github.com${path}`, { ...options, signal: AbortSignal.timeout(15000), redirect: 'error', headers: { ...common, authorization: `Bearer ${auth}` } })
    if (!response.ok) deny(`GitHub validation failed (${response.status}).`, response.status === 404 ? 403 : 502)
    return response.json()
  }
  const jwt = appJwt(config.appId, config.privateKey)
  const installation = await api(`/repos/${repository}/installation`, jwt)
  const access = await api(`/app/installations/${installation.id}/access_tokens`, jwt, { method: 'POST' })
  const get = path => api(`/repos/${repository}${path}`, access.token)
  const [repo, run, currentIssue] = await Promise.all([get(''), get(`/actions/runs/${identity.run_id}/attempts/${identity.run_attempt}`), get(`/issues/${event.issue.number}`)])
  if (String(repo.id) !== identity.repository_id || identity.workflow_ref !== `${repository}/.github/workflows/opencode.yml@refs/heads/${repo.default_branch}` || identity.ref !== `refs/heads/${repo.default_branch}`) deny('Run the approved listener from the default branch.')
  if (String(run.id) !== identity.run_id || String(run.run_attempt) !== identity.run_attempt || run.event !== 'issues' || run.repository?.id !== repo.id || run.path?.split('@')[0] !== '.github/workflows/opencode.yml') deny('Actions run validation failed.')
  const parsed = parseIssueRequest(event.issue, repo.default_branch)
  if (parsed.branchError || !parsed.request) deny(parsed.branchError || 'The request is empty.')
  const snapshot = snapshotHash(event.issue, parsed.targetRef)
  if (snapshotHash(currentIssue, parsed.targetRef) !== snapshot || currentIssue.user?.id !== event.issue.user?.id || currentIssue.state !== 'open') deny('The issue changed after this label event; approve and label its current request.')
  let timeline = []
  for (let page = 1; ; page++) {
    const entries = await get(`/issues/${event.issue.number}/timeline?per_page=100&page=${page}`)
    timeline.push(...entries)
    if (entries.length < 100) break
    if (page >= 100) deny('Issue timeline is too large to validate safely.')
  }
  const candidates = timeline.filter(entry => entry.event === 'labeled' && entry.label?.name === 'OpenCode' && entry.actor?.id === event.sender?.id && entry.created_at === event.issue.updated_at && Date.parse(entry.created_at) <= Date.parse(run.created_at))
  if (candidates.length !== 1) deny('Cannot uniquely verify the originating label event.')
  const requestId = String(candidates[0].id)
  const state = await config.store.read(repository, event.issue.number)
  let sender = currentIssue.user?.login
  if (currentIssue.user?.type === 'Bot') {
    if (!state.approval || state.approval.snapshot !== snapshot) deny('This App issue has no matching approval.')
    sender = state.approval.sender
  }
  if (!sender || (currentIssue.user?.type !== 'User' && currentIssue.user?.type !== 'Bot')) deny('Missing authorized issue author.')
  const permission = await get(`/collaborators/${encodeURIComponent(sender)}/permission`)
  if (!['write', 'maintain', 'admin'].includes(permission.permission)) deny('The issue author or approved submitter needs write, maintain, or admin access.')
  const branch = await get(`/branches/${encodeURIComponent(parsed.targetRef)}`)
  if (!/^[0-9a-f]{40}$/i.test(branch.commit?.sha || '')) deny('The selected branch has no valid commit.')
  const prior = state.claims[requestId]
  const active = state.active && state.claims[state.active]
  const priorRun = prior && await get(`/actions/runs/${prior.runId}/attempts/${prior.attempt}`)
  const activeRun = active && (active === prior ? priorRun : await get(`/actions/runs/${active.runId}/attempts/${active.attempt}`))
  if (activeRun && active !== prior && Date.parse(candidates[0].created_at) <= Date.parse(activeRun.updated_at)) deny('This request was submitted during an earlier execution; apply the label again.', 409)
  if (activeRun && activeRun.status !== 'completed') deny('This issue already has an active execution.', 409)
  if (prior && (prior.runId !== identity.run_id || Number(identity.run_attempt) <= Number(prior.attempt) || priorRun.status !== 'completed' || !['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(priorRun.conclusion))) deny('This label request is already claimed; retry a failed run explicitly.', 409)
  const inputs = { approved: 'true', issue_number: String(event.issue.number), request: parsed.request, issue_title: parsed.title, labels_json: JSON.stringify(labels(event.issue)), sender, target_ref: parsed.targetRef, target_sha: branch.commit.sha }
  await config.store.mutate(repository, event.issue.number, current => {
    if (current.version !== state.version) deny('The request changed during validation; retry preparation.', 409)
    current.claims[requestId] = { runId: identity.run_id, attempt: identity.run_attempt, snapshot, claimedAt: new Date().toISOString() }
    current.active = requestId
  })
  return inputs
}
