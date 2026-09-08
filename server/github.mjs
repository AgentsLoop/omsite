import { createHmac, createSign, timingSafeEqual } from 'node:crypto'

const API = 'https://api.github.com'
const REQUIRED_INSTALLATION_PERMISSIONS = {
  actions: 'read',
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
  if (!response.ok) throw Object.assign(new Error(data?.message || `GitHub returned ${response.status}`), { status: response.status })
  return data
}
export function extractUrls(issue, comments = []) {
  const text = [issue.body || '', ...comments.map(c => c.body || '')].join('\n')
  const urls = [...text.matchAll(/https:\/\/[^\s)<\"]+/g)].map(match => match[0].replace(/[.,]+$/, ''))
  const trycf = urls.filter(url => /\.trycloudflare\.com/i.test(url))
  const opencode = trycf.find(url => /\/session\/ses_/i.test(url)) || ''
  const preview = [...trycf].reverse().find(url => !/\/session\/ses_/i.test(url)) || ''
  const screenshots = [...new Set(urls.filter(url =>
    /raw\.githubusercontent\.com\/.+\/(?:screenshots|project%2Fscreenshots|project\/screenshots)\/.+\.(png|jpe?g|webp)/i.test(url) ||
    /github\.com\/user-attachments\/assets\//i.test(url) ||
    /user-images\.githubusercontent\.com\/.+\.(png|jpe?g|webp)/i.test(url)
  ))]
  const project = [...urls].reverse().find(url => /omgithub\.com\/[^/]+\/[^/]+\/tree\/[0-9a-f]{40}/i.test(url)) || ''
  return { opencode, preview, screenshots, project }
}
export function parseIssueRequest(issue, defaultBranch = 'main') {
  const body = String(issue?.body || '')
  const title = String(issue?.title || '').trim()
  const directive = title.match(/(?:^|\s)branch:\s*(.*?)\s*$/i)
  const requestTitle = directive ? title.slice(0, directive.index).trim() : title
  if (!directive) return { request: body.trim() || requestTitle, title: requestTitle, targetRef: defaultBranch, branchSpecified: false, branchError: '' }
  const targetRef = directive[1].trim()
  const invalid = !targetRef || targetRef.length > 255 || targetRef === '@' || targetRef.startsWith('-') ||
    targetRef.startsWith('/') || targetRef.endsWith('/') || targetRef.endsWith('.') || targetRef.endsWith('.lock') ||
    targetRef.includes('..') || targetRef.includes('@{') || targetRef.includes('//') ||
    targetRef.split('/').some(part => part.startsWith('.')) || /[\u0000-\u0020\u007f~^:?*[\]\\]/.test(targetRef)
  const request = body.trim() || requestTitle
  return {
    request,
    title: requestTitle,
    targetRef: invalid ? defaultBranch : targetRef,
    branchSpecified: true,
    branchError: invalid ? 'Invalid branch directive. End the issue title with `branch: <existing-branch>`.' : ''
  }
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
    'run-name: "OpenCode #${{ github.event.issue.number }} — ${{ github.event.issue.title }}"',
    '',
    'on:',
    '  issues:',
    '    types: [labeled]',
    '',
    'permissions: {}',
    '',
    'concurrency:',
    "  group: ${{ github.event.label.name == 'OpenCode' && format('opencode-issue-{0}-{1}', github.repository, github.event.issue.number) || format('opencode-skipped-{0}', github.run_id) }}",
    '  cancel-in-progress: false',
    '',
    'jobs:',
    '  prepare:',
    "    if: github.event.label.name == 'OpenCode'",
    '    permissions:',
    '      contents: read',
    '      issues: write',
    '      actions: read',
    '      id-token: write',
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

export function omgRequest(event, payload) {
  if (event !== 'issues') return null
  if (payload.issue?.pull_request) return null
  const automatedOpenCodeLabel = payload.sender?.type === 'Bot' && payload.action === 'labeled' && payload.label?.name === 'OpenCode'
  if (payload.sender?.type === 'Bot' && !automatedOpenCodeLabel) return null
  const labels = (payload.issue?.labels || []).map(label => typeof label === 'string' ? label : label.name).filter(Boolean)
  const openedWithoutOpenCode = payload.action === 'opened' && !labels.includes('OpenCode')
  const openCodeAdded = payload.action === 'labeled' && payload.label?.name === 'OpenCode' && labels.includes('OpenCode')
  if (!openedWithoutOpenCode && !openCodeAdded) return null
  if (!payload.installation?.id || !payload.repository?.full_name || !payload.issue?.number) return null
  const [owner, repo] = payload.repository.full_name.split('/')
  const parsed = parseIssueRequest(payload.issue, payload.repository.default_branch || 'main')
  return {
    owner,
    repo,
    repository: payload.repository.full_name,
    defaultBranch: payload.repository.default_branch || 'main',
    installationId: payload.installation.id,
    issueNumber: payload.issue.number,
    issueTitle: parsed.title,
    request: parsed.request,
    targetRef: parsed.targetRef,
    branchSpecified: parsed.branchSpecified,
    branchError: parsed.branchError,
    deliveryEvent: event,
    deliveryAction: payload.action,
    sender: automatedOpenCodeLabel ? payload.issue?.user?.login || '' : payload.sender?.login || '',
    labels,
    missingOpenCodeLabel: openedWithoutOpenCode
  }
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
    if (!content.includes('types: [labeled]') || !content.includes('uses: ./.github/workflows/opencode-prepare.yml') || !content.includes('uses: ./.github/workflows/opencode-reusable.yml')) {
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

export async function handleOmgRequest(request, config, requestFetch = fetch) {
  if (!request.missingOpenCodeLabel) return { route: 'issue-listener', repository: request.repository }
  const { installationToken, installed } = await ensureIssueWorkflow(request, config, requestFetch)
  const api = config.api || API
  const labelCreated = await ensureRepositoryLabel(request.owner, request.repo, installationToken, api, commonHeaders, requestFetch)
  const commentUrl = `${api}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/issues/${request.issueNumber}/comments`
  const response = await requestFetch(commentUrl, {
    method: 'POST', headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` },
    body: JSON.stringify({ body: 'Please add the `OpenCode` label to this issue to execute it.' })
  })
  if (!response.ok) throw new Error(`Issue reminder returned ${response.status}`)
  return { route: 'missing-opencode-label', repository: request.repository, labelCreated, installed, commented: true }
}
