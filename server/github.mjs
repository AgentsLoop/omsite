import { createHmac, createSign, timingSafeEqual } from 'node:crypto'

const API = 'https://api.github.com'
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
  const screenshots = [...new Set(urls.filter(url => /raw\.githubusercontent\.com\/.+\/(?:screenshots|project%2Fscreenshots|project\/screenshots)\/.+\.(png|jpe?g|webp)/i.test(url)))]
  const pr = [...urls].reverse().find(url => /github\.com\/[^/]+\/[^/]+\/pull\/\d+/i.test(url)) || ''
  return { opencode, preview, screenshots, pr }
}
export function slugify(value) { return String(value || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 46) || 'game' }

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

export function repositoryWorkflow(owner = 'GauntletLoop', repo = 'OhMyGithub', ref = 'main') {
  return [
    'name: OMG',
    'run-name: "OMG #${{ inputs.issue_number }} — ${{ inputs.issue_title }}"',
    '',
    'on:',
    '  workflow_dispatch:',
    '    inputs:',
    '      issue_number: { required: true }',
    '      request: { required: true }',
    '      issue_title: { required: true }',
    "      labels_json: { required: false, default: '[]' }",
    '      sender: { required: true }',
    '      source: { required: false, default: github-app }',
    '      target_ref: { required: false }',
    '',
    'permissions:',
    '  contents: write',
    '  issues: write',
    '  pull-requests: write',
    '  id-token: write',
    '',
    'jobs:',
    '  opencode:',
    `    uses: ${owner}/${repo}/.github/workflows/opencode-reusable.yml@${ref}`,
    '    with:',
    '      target_repository: ${{ github.repository }}',
    '      target_owner: ${{ github.repository_owner }}',
    '      target_repo: ${{ github.event.repository.name }}',
    '      target_ref: ${{ inputs.target_ref || github.event.repository.default_branch }}',
    '      issue_number: ${{ inputs.issue_number }}',
    '      request: ${{ inputs.request }}',
    '      issue_title: ${{ inputs.issue_title }}',
    '      labels_json: ${{ inputs.labels_json }}',
    '      sender: ${{ inputs.sender }}',
    '      use_app_token: false',
    '    secrets: inherit',
    ''
  ].join('\n')
}

export function omgRequest(event, payload) {
  if (!['issues', 'issue_comment'].includes(event)) return null
  if (payload.sender?.type === 'Bot' || payload.issue?.pull_request) return null
  if (event === 'issues' && !['opened', 'edited'].includes(payload.action)) return null
  if (event === 'issue_comment' && payload.action !== 'created') return null
  const text = event === 'issue_comment'
    ? String(payload.comment?.body || '')
    : `${payload.issue?.title || ''}\n${payload.issue?.body || ''}`
  if (!/(^|\s)\/omg(?:\s|$)/i.test(text)) return null
  if (!payload.installation?.id || !payload.repository?.full_name || !payload.issue?.number) return null
  const [owner, repo] = payload.repository.full_name.split('/')
  return {
    owner,
    repo,
    repository: payload.repository.full_name,
    defaultBranch: payload.repository.default_branch || 'main',
    installationId: payload.installation.id,
    issueNumber: payload.issue.number,
    issueTitle: payload.issue.title || '',
    request: event === 'issue_comment'
      ? String(payload.comment.body || '')
      : [payload.issue.body, payload.issue.title].map(value => String(value || '')).find(value => /(^|\s)\/omg(?:\s|$)/i.test(value)) || '',
    deliveryEvent: event,
    deliveryAction: payload.action,
    sender: payload.sender?.login || '',
    labels: (payload.issue.labels || []).map(label => typeof label === 'string' ? label : label.name).filter(Boolean)
  }
}

export async function dispatchOmgRequest(request, config, requestFetch = fetch) {
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
  const installationToken = (await tokenResponse.json()).token
  const workflowPath = `/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/contents/.github/workflows/opencode.yml?ref=${encodeURIComponent(request.defaultBranch)}`
  const workflowResponse = await requestFetch(`${api}${workflowPath}`, {
    headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` }
  })
  const inputs = {
    issue_number: String(request.issueNumber),
    request: request.request,
    issue_title: request.issueTitle,
    labels_json: JSON.stringify(request.labels),
    sender: request.sender,
    source: 'github-app'
  }
  if (workflowResponse.ok) {
    const dispatch = await requestFetch(`${api}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/actions/workflows/opencode.yml/dispatches`, {
      method: 'POST', headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` },
      body: JSON.stringify({ ref: request.defaultBranch, inputs })
    })
    if (!dispatch.ok) throw new Error(`Repository-local workflow dispatch returned ${dispatch.status}`)
    return { route: 'local', repository: request.repository }
  }
  if (workflowResponse.status !== 404) throw new Error(`Workflow lookup returned ${workflowResponse.status}`)
  const workflow = repositoryWorkflow(config.fallbackOwner, config.fallbackRepo, config.fallbackRef)
  const create = await requestFetch(`${api}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/contents/.github/workflows/opencode.yml`, {
    method: 'PUT', headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` },
    body: JSON.stringify({ message: 'Install Oh My Github App workflow', content: Buffer.from(workflow).toString('base64'), branch: request.defaultBranch })
  })
  if (!create.ok) throw new Error(`Repository workflow bootstrap returned ${create.status}`)
  const dispatchUrl = `${api}/repos/${encodeURIComponent(request.owner)}/${encodeURIComponent(request.repo)}/actions/workflows/opencode.yml/dispatches`
  let dispatch
  for (let attempt = 0; attempt < 5; attempt += 1) {
    dispatch = await requestFetch(dispatchUrl, {
      method: 'POST', headers: { ...commonHeaders, authorization: `Bearer ${installationToken}` },
      body: JSON.stringify({ ref: request.defaultBranch, inputs })
    })
    if (dispatch.ok || dispatch.status !== 404) break
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
  }
  if (!dispatch.ok) throw new Error(`Bootstrapped workflow dispatch returned ${dispatch.status}`)
  return { route: 'bootstrapped', repository: request.repository }
}
