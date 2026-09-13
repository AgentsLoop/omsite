import { issueTitleFromPrompt } from './issue-request.mjs'
import { remixRepository } from './repository-remix.mjs'
import { ensurePlayground } from './repository-create.mjs'
import { parseIssueRequest } from './github.mjs'

export async function generateIssue({ selection, user, ...options }) {
  if (!user?.token) throw Object.assign(new Error('Sign in with GitHub to generate.'), { status: 401 })
  if (selection != null && (!selection.owner || !selection.repo)) throw Object.assign(new Error('Select a valid repository.'), { status: 400 })
  const prompt = String(options.prompt || '').trim()
  const parsed = parseIssueRequest({ title: issueTitleFromPrompt(prompt), body: prompt })
  if (parsed.branchError) throw Object.assign(new Error(parsed.branchError), { status: 400 })
  if (selection == null) await ensurePlayground({ user, requestGithub: options.requestGithub })
  const result = await remixRepository({ ...options,
    owner: selection?.owner || user.login, repo: selection?.repo || 'PlayGround', user,
    ...(!selection ? { cloneRepository: async () => { throw Object.assign(new Error('Your GitHub account cannot write to your PlayGround repository.'), { status: 403 }) } } : {})
  })
  return { number: result.issue.number, github_url: result.issue.html_url,
    omgithub_path: `/${result.repository.full_name}/issues/${result.issue.number}`, workflow_installed: result.workflowInstalled }
}
