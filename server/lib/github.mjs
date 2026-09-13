import { createHmac, createSign, timingSafeEqual } from 'node:crypto'
export { parseIssueRequest } from './issue-request.mjs'

const API = 'https://api.github.com'
const REQUIRED_INSTALLATION_PERMISSIONS = {
  actions: 'write',
  contents: 'write',
  issues: 'write',
  workflows: 'write'
}

function missingInstallationPermissions(permissions = {}) {
  return Object.entries(REQUIRED_INSTALLATION_PERMISSIONS)
    .filter(([name, level]) => permissions[name] !== level && !(level === 'read' && permissions[name] === 'write'))
    .map(([name, level]) => `${name}: ${level}`)
}

export async function github(path, token, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { accept: 'application/vnd.github+json', 'user-agent': 'OmGithub', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } })
  const text = await response.text(); let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) throw Object.assign(new Error(data?.message || `GitHub returned ${response.status}`), { status: response.status, errors: data?.errors })
  return data
}
export function extractUrls(issue, comments = []) {
  const text = [issue.body || '', ...comments.map(c => c.body || '')].join('\n')
  const urls = [...text.matchAll(/https:\/\/[^\s)<\"]+/g)].map(match => match[0].replace(/[.,]+$/, ''))
  const trycf = urls.filter(url => /\.trycloudflare\.com/i.test(url))
  const labeled = (label, accept = () => true) => {
    const lines = text.split('\n').filter(line => label.test(line))
    return lines.reverse().map(line => line.match(/https:\/\/[^\s)<"]+/)?.[0]).find(url => url && accept(url)) || ''
  }
  const sessionUrl = url => /\.trycloudflare\.com\/.*session\/ses_/i.test(url)
  const validation = labeled(/validation.*(?:opencode|session|chat)/i, sessionUrl)
  const opencode = validation || [...trycf].reverse().find(sessionUrl) || ''
  const files = labeled(/project files/i)
  const preview = labeled(/final game|playable preview|^Preview:/i, url =>
    !/\.(png|jpe?g|webp|gif|svg|avif)(?:[?#]|$)/i.test(url) &&
    !/github\.com\/user-attachments\/assets\//i.test(url)
  )
  const branch = labeled(/created branch/i)
  const screenshots = [...new Set(urls.filter(url =>
    /raw\.githubusercontent\.com\/.+\/(?:screenshots|project%2Fscreenshots|project\/screenshots)\/.+\.(png|jpe?g|webp)/i.test(url) ||
    /github\.com\/user-attachments\/assets\//i.test(url) ||
    /github\.com\/[^/]+\/[^/]+\/releases\/download\/.+\.(png|jpe?g|webp)/i.test(url) ||
    /user-images\.githubusercontent\.com\/.+\.(png|jpe?g|webp)/i.test(url)
  ))]
  const project = [...urls].reverse().find(url => /omgithub\.com\/[^/]+\/[^/]+\/tree\/[0-9a-f]{40}/i.test(url)) || ''
  return { opencode, preview, screenshots, project, files, branch }
}
function base64url(value) {
  return Buffer.from(value).toString('base64url')
}

export function appJwt(appId, privateKey, now = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(appId) }))
  const unsigned = `${header}.${payload}`
  return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).end().sign(privateKey, 'base64url')}`
}

export function verifyWebhookSignature(body, signature, secret) {
  if (!secret || !signature?.startsWith('sha256=')) return false
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`)
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function repositoryWorkflow(owner = 'AgentsLoop', repo = 'OhMyGithub', ref) {
  if (!/^[a-f0-9]{40}$/.test(ref || '')) throw new Error('Require an immutable central workflow commit SHA')
  return [
    'name: OpenCode',
    'run-name: "OpenCode #${{ github.event.issue.number || inputs.issue_number }}${{ github.event.issue.title && format(\' — {0}\', github.event.issue.title) || \'\' }}"',
    '',
    'on:',
    '  issues:',
    '    types: [opened]',
    '  workflow_dispatch:',
    '    inputs:',
    '      issue_number:',
    '        description: Existing issue to run',
    '        required: true',
    '        type: string',
    '',
    'permissions: {}',
    '',
    'concurrency:',
    '  group: opencode-issue-${{ github.repository }}-${{ github.event.issue.number || inputs.issue_number }}',
    '  cancel-in-progress: false',
    '',
    'jobs:',
    '  prepare:',
    "    if: github.event_name == 'workflow_dispatch' || (github.event.action == 'opened' && (contains(github.event.issue.labels.*.name, 'OpenCode') || contains(github.event.issue.title, '/OpenCode')))",
    '    permissions:',
    '      contents: read',
    '      issues: write',
    '      actions: write',
    `    uses: ${owner}/${repo}/.github/workflows/opencode-prepare.yml@${ref}`,
    '    with:',
    `      runtime_ref: ${ref}`,
    '',
    '  opencode:',
    '    needs: prepare',
    "    if: needs.prepare.outputs.approved == 'true'",
    '    permissions:',
    '      contents: write',
    '      issues: write',
    '      actions: read',
    '      pull-requests: write',
    `    uses: ${owner}/${repo}/.github/workflows/opencode-reusable.yml@${ref}`,
    '    with:',
    `      runtime_ref: ${ref}`,
    ...['issue_number', 'request', 'issue_title', 'labels_json', 'sender', 'target_ref', 'target_sha'].map(name => `      ${name}: \${{ needs.prepare.outputs.${name} }}`),
    '    secrets:',
    '      OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}',
    '      OPENCODE_AUTH_JSON: ${{ secrets.OPENCODE_AUTH_JSON }}',
    '      AGENTSWEB_SSH_PUBLIC_KEY: ${{ secrets.AGENTSWEB_SSH_PUBLIC_KEY }}',
    ''
  ].join('\n')
}

function hasOpenCodeLabel(labels = []) {
  return labels.some(label => String(typeof label === 'string' ? label : label?.name).toLowerCase() === 'opencode')
}

export function isActionableIssueEvent(event, payload) {
  if (event !== 'issues') return false
  if (payload?.action === 'opened') return hasOpenCodeLabel(payload.issue?.labels) || String(payload.issue?.title || '').includes('/OpenCode')
  return false
}

export async function handleActionableIssue(payload, config, requestFetch = fetch) {
  if (!payload.installation?.id || payload.action !== 'opened') throw new Error('Require an actionable issue installation event')
  const owner = payload.repository?.owner?.login
  const repo = payload.repository?.name
  const issueNumber = payload.issue?.number
  if (!owner || !repo || !Number.isInteger(issueNumber)) throw new Error('Opened issue webhook is missing repository or issue data')

  const result = await ensureIssueWorkflow({ owner, repo }, config, requestFetch)
  const api = config.api || API
  const headers = { ...commonHeaders, authorization: `Bearer ${result.installationToken}` }
  let dispatched = false
  if (result.installed) {
    const dispatchPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/opencode.yml/dispatches`
    const dispatchedResponse = await requestFetch(`${api}${dispatchPath}`, {
      method: 'POST', headers, body: JSON.stringify({ ref: result.repository.default_branch, inputs: { issue_number: String(issueNumber) } })
    })
    if (!dispatchedResponse.ok) throw new Error(`GitHub ${dispatchPath} returned ${dispatchedResponse.status}`)
    dispatched = true
  }
  return { repository: result.repository.full_name, installed: result.installed, dispatched }
}

async function ensureRepositoryLabel(owner, repo, token, api, commonHeaders, requestFetch) {
  const labelsUrl = `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels`
  const labelUrl = `${labelsUrl}/${encodeURIComponent('OpenCode')}`
  const existing = await requestFetch(labelUrl, {
    headers: { ...commonHeaders, authorization: `Bearer ${token}` }
  })
  if (existing.ok) return false
  if (existing.status !== 404) throw new Error(`OpenCode repository label lookup returned ${existing.status}`)

  const created = await requestFetch(labelsUrl, {
    method: 'POST',
    headers: { ...commonHeaders, authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'OpenCode', color: '1f6feb', description: 'Issues that can be executed by OpenCode' })
  })
  if (created.ok) return true
  if (created.status !== 422) throw new Error(`OpenCode repository label creation returned ${created.status}`)

  const raced = await requestFetch(labelUrl, {
    headers: { ...commonHeaders, authorization: `Bearer ${token}` }
  })
  if (raced.ok) return false
  throw new Error(`OpenCode repository label creation returned ${created.status}`)
}

const commonHeaders = {
  accept: 'application/vnd.github+json',
  'content-type': 'application/json',
  'user-agent': 'OmGithub',
  'x-github-api-version': '2022-11-28'
}

export async function ensureIssueWorkflow({ owner, repo }, config, requestFetch = fetch) {
  const api = config.api || API
  const repositoryPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const jwt = appJwt(config.appId, config.privateKey)
  const call = async (path, token, options = {}) => {
    const response = await requestFetch(`${api}${path}`, {
      ...options, headers: { ...commonHeaders, authorization: `Bearer ${token}` }
    })
    if (!response.ok) throw new Error(`GitHub ${path} returned ${response.status}`)
    return response.json()
  }
  const installation = await call(`${repositoryPath}/installation`, jwt)
  const tokenData = await call(`/app/installations/${installation.id}/access_tokens`, jwt, { method: 'POST' })
  const installationToken = tokenData.token
  const missingPermissions = missingInstallationPermissions(tokenData.permissions)
  if (missingPermissions.length) throw new Error(`Approve required App installation permissions: ${missingPermissions.join(', ')}`)
  const repository = await call(repositoryPath, installationToken)
  await ensureRepositoryLabel(owner, repo, installationToken, api, commonHeaders, requestFetch)
  const centralOwner = config.fallbackOwner || 'AgentsLoop'
  const centralRepo = config.fallbackRepo || 'OhMyGithub'
  const centralRef = config.fallbackRef || 'main'
  const centralPath = `/repos/${encodeURIComponent(centralOwner)}/${encodeURIComponent(centralRepo)}`
  const commit = await call(`${centralPath}/commits/${encodeURIComponent(centralRef)}`, installationToken)
  const workflowSha = commit.sha
  const workflow = repositoryWorkflow(centralOwner, centralRepo, workflowSha)
  // Check both entry points before installing a caller pinned to this revision.
  for (const file of ['opencode-prepare.yml', 'opencode-reusable.yml']) {
    await call(`${centralPath}/contents/.github/workflows/${file}?ref=${workflowSha}`, installationToken)
  }
  const workflowPath = `${repositoryPath}/contents/.github/workflows/opencode.yml`
  const readUrl = `${workflowPath}?ref=${encodeURIComponent(repository.default_branch)}`
  const existingResponse = await requestFetch(`${api}${readUrl}`, { headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` } })
  if (!existingResponse.ok && existingResponse.status !== 404) throw new Error(`Workflow lookup returned ${existingResponse.status}`)
  const existing = existingResponse.ok ? await existingResponse.json() : null
  const content = existing ? Buffer.from(existing.content || '', 'base64').toString() : ''
  if (content === workflow) return { installationToken, repository, workflowSha, installed: false }
  // Preserve the central repository's reviewed local caller.
  if (owner.toLowerCase() === centralOwner.toLowerCase() && repo.toLowerCase() === centralRepo.toLowerCase()) {
    if (!content.includes('types: [opened]') || !content.includes('uses: ./.github/workflows/opencode-prepare.yml') || !content.includes('uses: ./.github/workflows/opencode-reusable.yml')) {
      throw new Error('Install and review the central repository issue listener before accepting requests')
    }
    return { installationToken, repository, workflowSha, installed: false }
  }
  await call(workflowPath, installationToken, {
    method: 'PUT',
    body: JSON.stringify({ message: 'Install native OpenCode issue listener', content: Buffer.from(workflow).toString('base64'), branch: repository.default_branch, ...(existing ? { sha: existing.sha } : {}) })
  })
  const verified = await call(readUrl, installationToken)
  if (Buffer.from(verified.content || '', 'base64').toString() !== workflow) throw new Error('Installed issue listener verification failed')
  return { installationToken, repository, workflowSha, installed: true }
}
