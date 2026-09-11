import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exec = promisify(execFile)

export async function copyRepositoryHistory({ source, target, token }) {
  const directory = await mkdtemp(join(tmpdir(), 'omgithub-remix-'))
  try {
    const checkout = join(directory, 'source.git')
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    await exec('git', ['clone', '--bare', `https://github.com/${source}.git`, checkout], { env, timeout: 120000 })
    const pushEnv = { ...env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}` }
    await exec('git', ['-C', checkout, 'push', `https://github.com/${target}.git`, 'refs/heads/*:refs/heads/*', 'refs/tags/*:refs/tags/*'], { env: pushEnv, timeout: 120000 })
  } catch {
    throw Object.assign(new Error(`Could not copy repository history to ${target}. The created repository remains available on GitHub.`), { status: 502 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function clonePublicRepository({ repository, owner, repo, user, requestGithub, copyHistory = copyRepositoryHistory }) {
  for (let suffix = 0; suffix < 100; suffix++) {
    const name = suffix ? `${repo.slice(0, 90)}-${suffix}` : repo
    try {
      await requestGithub(`/repos/${user.login}/${name}`, user.token)
      continue
    } catch (error) { if (error.status !== 404) throw error }
    let target
    try {
      target = await requestGithub('/user/repos', user.token, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, private: false, has_issues: true, description: `Remix of ${owner}/${repo}` }) })
    } catch (error) { if (error.status === 422) continue; throw error }
    await copyHistory({ source: `${owner}/${repo}`, target: `${user.login}/${name}`, token: user.token })
    await requestGithub(`/repos/${user.login}/${name}`, user.token, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ default_branch: repository.default_branch }) })
    return { ...target, full_name: `${user.login}/${name}`, default_branch: repository.default_branch, has_issues: true }
  }
  throw Object.assign(new Error('Could not find an available repository name.'), { status: 409 })
}
