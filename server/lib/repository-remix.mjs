import { issueTitleFromPrompt } from './issue-request.mjs'
import { repositoryWorkflow, parseIssueRequest } from './github.mjs'
import { clonePublicRepository } from './repository-clone.mjs'

function failure(message, status) {
  return Object.assign(new Error(message), { status })
}

function repositoryPath(owner, repo) {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) throw failure('Invalid repository name.', 400)
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
}

async function optionalGithub(path, token, requestGithub) {
  try { return await requestGithub(path, token) } catch (error) {
    if (error.status === 404) return null
    throw error
  }
}

export async function remixRepository({ owner, repo, prompt, user, origin, config, requestGithub, cloneRepository = clonePublicRepository }) {
  const request = String(prompt || '').trim()
  if (!user?.token) throw failure('Sign in with GitHub to remix a repository.', 401)
  const parsed = parseIssueRequest({ title: issueTitleFromPrompt(request), body: request })
  if (parsed.branchError) throw failure(parsed.branchError, 400)

  let path = repositoryPath(owner, repo)
  let repository = await requestGithub(path, user.token)
  if (repository.private) throw failure('Only public repositories are supported.', 400)
  const canWrite = repository.permissions?.admin || repository.permissions?.maintain || repository.permissions?.push
  if (!canWrite) {
    repository = await cloneRepository({ repository, owner, repo, user, requestGithub })
    const [targetOwner, targetRepo] = repository.full_name.split('/')
    path = repositoryPath(targetOwner, targetRepo)
  }
  if (repository.archived) throw failure('Archived repositories cannot be remixed.', 409)
  if (repository.has_issues === false) throw failure('Enable GitHub Issues before you remix this repository.', 409)
  if (parsed.branchSpecified) await requestGithub(`${path}/branches/${encodeURIComponent(parsed.targetRef)}`, user.token)

  const centralOwner = config.fallbackOwner || 'AgentsLoop'
  const centralRepo = config.fallbackRepo || 'OhMyGithub'
  const centralRef = config.fallbackRef || 'main'
  const centralPath = repositoryPath(centralOwner, centralRepo)
  const commit = await requestGithub(`${centralPath}/commits/${encodeURIComponent(centralRef)}`, user.token)
  for (const file of ['opencode-prepare.yml', 'opencode-reusable.yml']) {
    await requestGithub(`${centralPath}/contents/.github/workflows/${file}?ref=${commit.sha}`, user.token)
  }

  const workflow = repositoryWorkflow(centralOwner, centralRepo, commit.sha)
  const workflowPath = `${path}/contents/.github/workflows/opencode.yml`
  const existing = await optionalGithub(`${workflowPath}?ref=${encodeURIComponent(repository.default_branch)}`, user.token, requestGithub)
  const current = existing ? Buffer.from(existing.content || '', 'base64').toString() : ''
  let workflowInstalled = false
  const isCentral = repository.full_name.toLowerCase() === `${centralOwner}/${centralRepo}`.toLowerCase()
  if (isCentral) {
    if (!current.includes('types: [opened]') ||
        !current.includes('uses: ./.github/workflows/opencode-prepare.yml') ||
        !current.includes('uses: ./.github/workflows/opencode-reusable.yml')) {
      throw failure('Install and review the central repository issue listener before accepting requests', 409)
    }
  } else if (current !== workflow) {
    await requestGithub(workflowPath, user.token, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: 'Install OpenCode issue listener',
        content: Buffer.from(workflow).toString('base64'),
        branch: repository.default_branch,
        ...(existing ? { sha: existing.sha } : {})
      })
    })
    workflowInstalled = true
  }

  const labelPath = `${path}/labels/${encodeURIComponent('OpenCode')}`
  const label = await optionalGithub(labelPath, user.token, requestGithub)
  if (!label) {
    try {
      await requestGithub(`${path}/labels`, user.token, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'OpenCode', color: '1f6feb', description: 'Issues that can be executed by OpenCode' })
      })
    } catch (error) {
      if (error.status !== 422) throw error
    }
  }

  const issue = await requestGithub(`${path}/issues`, user.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: issueTitleFromPrompt(request),
      body: request,
      labels: ['OpenCode']
    })
  })
  return { repository, issue, workflowInstalled, workflowSha: commit.sha }
}
