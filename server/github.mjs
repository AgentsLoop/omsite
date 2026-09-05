import { createHmac, createSign, timingSafeEqual } from 'node:crypto'

const API = 'https://api.github.com'
const REQUIRED_INSTALLATION_PERMISSIONS = {
  actions: 'write',
  contents: 'write',
  issues: 'write',
  workflows: 'write'
}

function missingInstallationPermissions(permissions = {}) {
  return Object.entries(REQUIRED_INSTALLATION_PERMISSIONS)
    .filter(([name, level]) => permissions[name] !== level)
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
  const published = [...urls].reverse().find(url => /https:\/\/[^/]+\.github\.io(?:\/[^\s)<\"]*)?/i.test(url)) || ''
  const screenshots = [...new Set(urls.filter(url =>
    /raw\.githubusercontent\.com\/.+\/(?:screenshots|project%2Fscreenshots|project\/screenshots)\/.+\.(png|jpe?g|webp)/i.test(url) ||
    /github\.com\/user-attachments\/assets\//i.test(url) ||
    /user-images\.githubusercontent\.com\/.+\.(png|jpe?g|webp)/i.test(url)
  ))]
  const pr = [...urls].reverse().find(url => /github\.com\/[^/]+\/[^/]+\/pull\/\d+/i.test(url)) || ''
  return { opencode, preview, published, screenshots, pr }
}
export function slugify(value) { return String(value || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 46) || 'game' }

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

export function repositoryWorkflow(owner = 'AgentsLoop', repo = 'OhMyGithub', ref = 'main') {
  return [
    'name: OpenCode',
    'run-name: "OpenCode #${{ inputs.issue_number }} — ${{ inputs.issue_title }}"',
    '',
    'on:',
    '  workflow_dispatch:',
    '    inputs:',
    '      issue_number: { required: true }',
    '      request: { required: true }',
    '      issue_title: { required: true }',
    "      labels_json: { required: false, default: '[]' }",
    '      sender: { required: true }',
    "      pages_publish_enabled: { required: false, default: 'true', type: boolean }",
    '',
    'permissions:',
    '  contents: write',
    '  issues: write',
    '  pull-requests: write',
    '  pages: write',
    '  id-token: write',
    '',
    'jobs:',
    '  opencode:',
    `    uses: ${owner}/${repo}/.github/workflows/opencode-reusable.yml@${ref}`,
    '    with:',
    '      issue_number: ${{ inputs.issue_number }}',
    '      request: ${{ inputs.request }}',
    '      issue_title: ${{ inputs.issue_title }}',
    '      labels_json: ${{ inputs.labels_json }}',
    '      sender: ${{ inputs.sender }}',
    '      pages_publish_enabled: ${{ inputs.pages_publish_enabled }}',
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

async function activeWorkflowRun(request, config, requestFetch) {
  const path = `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/actions/runs?event=workflow_dispatch&status=in_progress&per_page=100`
  const response = await requestFetch(`${config.api || API}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'OmGithub',
      'x-github-api-version': '2022-11-28',
      authorization: `Bearer ${config.installationToken}`
    }
  })
  if (!response.ok) throw new Error(`Active workflow lookup returned ${response.status}`)
  const data = await response.json()
  const prefix = `OpenCode #${request.issueNumber} —`
  return (data.workflow_runs || []).find(run => String(run.name || run.display_title || '').startsWith(prefix)) || null
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

export async function ensurePagesEnvironment(owner, repo, defaultBranch, token, api, commonHeaders, requestFetch) {
  const environmentUrl = `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/environments/${encodeURIComponent('github-pages')}`
  const environment = await requestFetch(environmentUrl, {
    method: 'PUT',
    headers: { ...commonHeaders, authorization: `Bearer ${token}` },
    body: JSON.stringify({
      deployment_branch_policy: {
        protected_branches: false,
        custom_branch_policies: true
      }
    })
  })
  if (!environment.ok) throw Object.assign(new Error(`GitHub Pages environment setup returned ${environment.status}`), { status: environment.status })

  const policiesUrl = `${environmentUrl}/deployment-branch-policies`
  const policies = await requestFetch(policiesUrl, {
    headers: { ...commonHeaders, authorization: `Bearer ${token}` }
  })
  if (!policies.ok) throw Object.assign(new Error(`GitHub Pages deployment policy lookup returned ${policies.status}`), { status: policies.status })
  const existing = await policies.json()
  if ((existing.branch_policies || []).some(policy => policy.type === 'branch' && policy.name === defaultBranch)) return false

  const policy = await requestFetch(policiesUrl, {
    method: 'POST',
    headers: { ...commonHeaders, authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: defaultBranch, type: 'branch' })
  })
  if (!policy.ok) throw Object.assign(new Error(`GitHub Pages deployment policy setup returned ${policy.status}`), { status: policy.status })
  return true
}

async function dispatchOmgRequestOnce(request, config, requestFetch) {
  const api = config.api || API
  const commonHeaders = {
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'OmGithub',
    'x-github-api-version': '2022-11-28'
  }
  const jwt = appJwt(config.appId, config.privateKey)
  const tokenResponse = await requestFetch(`${api}/app/installations/${request.installationId}/access_tokens`, {
    method: 'POST', headers: { ...commonHeaders, authorization: `Bearer ${jwt}` }
  })
  if (!tokenResponse.ok) throw new Error(`Installation token request returned ${tokenResponse.status}`)
  const tokenData = await tokenResponse.json()
  const installationToken = tokenData.token
  config = { ...config, installationToken }
  const commentUrl = `${api}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/issues/${request.issueNumber}/comments`
  const commentTokens = [...new Set([installationToken, config.notificationToken].filter(Boolean))]
  const commentOnIssue = async body => {
    for (const token of commentTokens) {
      const comment = await requestFetch(commentUrl, {
        method: 'POST',
        headers: { ...commonHeaders, authorization: `Bearer ${token}` },
        body: JSON.stringify({ body })
      })
      if (comment.ok) return true
    }
    return false
  }
  if (request.missingOpenCodeLabel) {
    const labelCreated = await ensureRepositoryLabel(request.owner, request.repo, installationToken, api, commonHeaders, requestFetch)
    const commented = await commentOnIssue('Please add the `OpenCode` label to this issue to execute it.')
    return { route: 'missing-opencode-label', repository: request.repository, labelCreated, commented }
  }
  const permissionResponse = await requestFetch(`${api}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/collaborators/${encodeURIComponent(request.sender)}/permission`, {
    headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` }
  })
  const permission = permissionResponse.ok ? (await permissionResponse.json()).permission : ''
  if (!['admin', 'maintain', 'write'].includes(permission)) {
    const commented = await commentOnIssue(`⚠️ **OpenCode did not start.**\n\n@${request.sender || 'the issue author'} needs write, maintain, or admin access to \`${request.repository}\` to start an OpenCode run.`)
    return { route: 'unauthorized-actor', repository: request.repository, commented }
  }
  const workflowPath = `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/contents/.github/workflows/opencode.yml?ref=${encodeURIComponent(request.targetRef)}`
  const workflowResponse = await requestFetch(`${api}${workflowPath}`, {
    headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` }
  })
  const missingPermissions = missingInstallationPermissions(tokenData.permissions)
  if (missingPermissions.length) {
    const body = [
      '⚠️ **OpenCode did not start.**',
      '',
      'The Oh My GitHub App installation is missing required repository permissions:',
      '',
      ...missingPermissions.map(permission => `- \`${permission}\``),
      '',
      'Ask an installation owner to approve the updated App permissions, then remove and re-add the `OpenCode` label to retry.'
    ].join('\n')
    const commented = await commentOnIssue(body)
    return { route: 'permissions-missing', repository: request.repository, missingPermissions, commented }
  }
  if (request.branchError) {
    const commented = await commentOnIssue(`⚠️ **OpenCode did not start.**\n\n${request.branchError}`)
    return { route: 'invalid-branch', repository: request.repository, targetRef: request.targetRef, commented }
  }
  if (request.branchSpecified) {
    const branchResponse = await requestFetch(`${api}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/branches/${encodeURIComponent(request.targetRef)}`, {
      headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` }
    })
    if (branchResponse.status === 404) {
      const body = `⚠️ **OpenCode did not start.**\n\nThe requested branch \`${request.targetRef}\` does not exist in \`${request.repository}\`. Update the issue-title suffix and remove/re-add the \`OpenCode\` label to retry.`
      const commented = await commentOnIssue(body)
      return { route: 'invalid-branch', repository: request.repository, targetRef: request.targetRef, commented }
    }
    if (!branchResponse.ok) throw new Error(`Target branch lookup returned ${branchResponse.status}`)
  }
  const existingRun = await activeWorkflowRun(request, config, requestFetch)
  if (existingRun) return { route: 'duplicate-active-run', repository: request.repository, runId: existingRun.id }
  const inputs = {
    issue_number: String(request.issueNumber),
    request: request.request,
    issue_title: request.issueTitle,
    labels_json: JSON.stringify(request.labels),
    sender: request.sender,
    pages_publish_enabled: 'true'
  }
  try {
    await ensurePagesEnvironment(request.owner, request.repo, request.defaultBranch || request.targetRef || 'main', installationToken, api, commonHeaders, requestFetch)
  } catch (error) {
    if (error.status !== 403) throw error
    inputs.pages_publish_enabled = 'false'
  }
  if (workflowResponse.ok) {
    const dispatch = await requestFetch(`${api}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/actions/workflows/opencode.yml/dispatches`, {
      method: 'POST', headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` },
      body: JSON.stringify({ ref: request.targetRef, inputs })
    })
    if (!dispatch.ok) throw new Error(`Repository-local workflow dispatch returned ${dispatch.status}`)
    return { route: 'local', repository: request.repository }
  }
  if (workflowResponse.status !== 404) throw new Error(`Workflow lookup returned ${workflowResponse.status}`)
  const workflow = repositoryWorkflow(config.fallbackOwner, config.fallbackRepo, config.fallbackRef)
  const create = await requestFetch(`${api}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/contents/.github/workflows/opencode.yml`, {
    method: 'PUT', headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` },
    body: JSON.stringify({ message: 'Install Oh My Github App workflow', content: Buffer.from(workflow).toString('base64'), branch: request.targetRef })
  })
  if (!create.ok) throw new Error(`Repository workflow bootstrap returned ${create.status}`)
  const dispatchUrl = `${api}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/actions/workflows/opencode.yml/dispatches`
  let dispatch
  for (let attempt = 0; attempt < 5; attempt += 1) {
    dispatch = await requestFetch(dispatchUrl, {
      method: 'POST', headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` },
      body: JSON.stringify({ ref: request.targetRef, inputs })
    })
    if (dispatch.ok || dispatch.status !== 404) break
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
  }
  if (!dispatch.ok) throw new Error(`Bootstrapped workflow dispatch returned ${dispatch.status}`)
  return { route: 'bootstrapped', repository: request.repository }
}

export async function dispatchOmgRequest(request, config, requestFetch = fetch) {
  return dispatchOmgRequestOnce(request, config, requestFetch)
}
