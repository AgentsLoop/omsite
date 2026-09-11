import { remixRepository } from './repository-remix.mjs'

export async function generateIssue({ selection, user, serverToken, ...options }) {
  if (!user?.token) throw Object.assign(new Error('Sign in with GitHub to generate.'), { status: 401 })
  if (selection != null && (!selection.owner || !selection.repo)) throw Object.assign(new Error('Select a valid repository.'), { status: 400 })
  if (selection == null && !serverToken) throw Object.assign(new Error('Playground generation is not configured.'), { status: 503 })
  const result = await remixRepository({ ...options,
    owner: selection?.owner || 'AgentsLoop', repo: selection?.repo || 'PlayGround',
    user: selection ? user : { ...user, token: serverToken },
    ...(!selection ? { cloneRepository: async () => { throw Object.assign(new Error('The server cannot write to Playground.'), { status: 503 }) } } : {})
  })
  return { number: result.issue.number, github_url: result.issue.html_url,
    omgithub_path: `/${result.repository.full_name}/issues/${result.issue.number}`, workflow_installed: result.workflowInstalled }
}
