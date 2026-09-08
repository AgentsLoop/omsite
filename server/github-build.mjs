import { randomUUID } from 'node:crypto'

const API = 'https://api.github.com'
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000
const DEFAULT_POLL_MS = 3000

function headers(token) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'OmGithub',
    'x-github-api-version': '2022-11-28'
  }
}

async function githubJson(path, token, requestFetch, options = {}) {
  const response = await requestFetch(`${API}${path}`, { ...options, headers: { ...headers(token), ...(options.headers || {}) } })
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) throw Object.assign(new Error(data?.message || `GitHub returned ${response.status}`), { status: response.status })
  return data
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function workflowPath(owner, repo, file) {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${file.split('/').map(encodeURIComponent).join('/')}`
}

export async function dispatchPublicBuild({
  sourceOwner,
  sourceRepo,
  sourceSha,
  workflowOwner,
  workflowRepo,
  workflowFile = 'omgithub-build.yml',
  workflowRef = 'main',
  token,
  uploadUrl,
  uploadToken,
  requestFetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  pollMs = DEFAULT_POLL_MS
}) {
  if (!token) throw Object.assign(new Error('GitHub Actions build requires GITHUB_TOKEN'), { status: 503 })
  const requestId = randomUUID()
  const workflow = workflowPath(workflowOwner, workflowRepo, workflowFile)
  const startedAt = Date.now()
  await githubJson(`${workflow}/dispatches`, token, requestFetch, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ref: workflowRef,
      inputs: { source_owner: sourceOwner, source_repo: sourceRepo, source_sha: sourceSha, request_id: requestId, upload_url: uploadUrl, upload_token: uploadToken }
    })
  })

  const deadline = startedAt + timeoutMs
  let run = null
  while (Date.now() < deadline) {
    if (run) {
      run = await githubJson(`/repos/${encodeURIComponent(workflowOwner)}/${encodeURIComponent(workflowRepo)}/actions/runs/${run.id}`, token, requestFetch)
    } else {
      const data = await githubJson(`${workflow}/runs?event=workflow_dispatch&branch=${encodeURIComponent(workflowRef)}&per_page=50`, token, requestFetch)
      run = (data.workflow_runs || []).find(candidate => String(candidate.display_title || '').includes(requestId))
    }
    if (run?.status === 'completed') break
    await wait(Math.min(pollMs, Math.max(0, deadline - Date.now())))
  }
  if (!run) throw Object.assign(new Error('GitHub Actions build did not start before the timeout'), { status: 504 })
  if (run.status !== 'completed') throw Object.assign(new Error('GitHub Actions build timed out'), { status: 504 })
  if (run.conclusion !== 'success') throw Object.assign(new Error(`GitHub Actions build ${run.conclusion || 'failed'}`), { status: 502 })
  return { run }
}
