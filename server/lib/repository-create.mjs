import { publicRepository } from './profile-repositories.mjs'

function failure(message, status) { return Object.assign(new Error(message), { status }) }

export function validateRepositoryName(value) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(name) || name === '.' || name === '..') {
    throw failure('Use 1–100 letters, numbers, hyphens, underscores, or periods for the repository name.', 400)
  }
  return name
}

export async function createUserRepository({ name, user, requestGithub }) {
  if (!user?.token || !user.login) throw failure('Sign in with GitHub to create a project.', 401)
  name = validateRepositoryName(name)
  try {
    const repository = await requestGithub('/user/repos', user.token, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, private: false, auto_init: true, has_issues: true })
    })
    return publicRepository({ ...repository, permissions: { ...repository.permissions, push: true } })
  } catch (error) {
    const detail = error.errors?.map(item => typeof item === 'string' ? item : item.message).filter(Boolean).join(' ')
    if (detail) throw failure(detail, error.status)
    throw error
  }
}

export async function ensurePlayground({ user, requestGithub }) {
  if (!user?.token || !user.login) throw failure('Sign in with GitHub to generate.', 401)
  const path = `/repos/${encodeURIComponent(user.login)}/PlayGround`
  let repository
  try { repository = await requestGithub(path, user.token) }
  catch (error) {
    if (error.status !== 404) throw error
    try {
      await createUserRepository({ name: 'PlayGround', user, requestGithub })
    } catch (creationError) {
      // Another request can create Playground after our lookup.
      if (creationError.status !== 422) throw creationError
      try { repository = await requestGithub(path, user.token) }
      catch { throw creationError }
    }
    repository ||= await requestGithub(path, user.token)
  }
  if (repository.private) throw failure('Your PlayGround repository is private. Select a public repository or create a New Project.', 409)
  if (repository.archived || repository.disabled) throw failure('Your PlayGround repository is archived or unavailable. Select another repository.', 409)
  if (repository.has_issues === false) throw failure('Enable GitHub Issues in your PlayGround repository before generating.', 409)
  if (!(repository.permissions?.admin || repository.permissions?.maintain || repository.permissions?.push)) {
    throw failure('Your GitHub account cannot write to your PlayGround repository.', 403)
  }
  if (!repository.default_branch) throw failure('Initialize your PlayGround repository with a first commit before generating.', 409)
  try { await requestGithub(`${path}/branches/${encodeURIComponent(repository.default_branch)}`, user.token) }
  catch (error) {
    if (error.status === 404 || error.status === 409) throw failure('Initialize your PlayGround repository with a first commit before generating.', 409)
    throw error
  }
  return repository
}
