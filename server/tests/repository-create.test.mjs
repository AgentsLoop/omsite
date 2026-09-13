import assert from 'node:assert/strict'
import test from 'node:test'
import { createUserRepository, ensurePlayground, validateRepositoryName } from '../lib/repository-create.mjs'
import { generateIssue } from '../lib/generation.mjs'

const user = { login: 'player', token: 'user-token' }
const repository = { id: 7, name: 'PlayGround', full_name: 'player/PlayGround', owner: { login: 'player' }, private: false, default_branch: 'main', has_issues: true, permissions: { push: true } }
const missing = () => Object.assign(new Error('Not found'), { status: 404 })

test('create a named public initialized repository and return a normalized option', async () => {
  const result = await createUserRepository({ name: '  my-project  ', user, requestGithub: async (path, token, options) => {
    assert.equal(path, '/user/repos')
    assert.equal(token, user.token)
    assert.deepEqual(JSON.parse(options.body), { name: 'my-project', private: false, auto_init: true, has_issues: true })
    return { ...repository, name: 'my-project', full_name: 'player/my-project' }
  } })
  assert.equal(result.full_name, 'player/my-project')
  assert.equal(result.owner, 'player')
  assert.equal(result.can_write, true)
  assert.equal(result.deployment_status, 'not_deployed')
})

test('reject invalid names and unauthenticated creation before calling GitHub', async () => {
  for (const name of ['', '.', '..', 'has space', 'owner/repo', 'a'.repeat(101), null, 42]) assert.throws(() => validateRepositoryName(name), error => error.status === 400)
  assert.equal(validateRepositoryName('my.repo_name-1'), 'my.repo_name-1')
  await assert.rejects(() => createUserRepository({ name: 'game', requestGithub: () => assert.fail('Unexpected GitHub call') }), error => error.status === 401)
})

test('preserve GitHub name-conflict detail without renaming or retrying', async () => {
  let calls = 0
  await assert.rejects(() => createUserRepository({ name: 'game', user, requestGithub: async () => {
    calls++
    throw Object.assign(new Error('Repository creation failed.'), { status: 422, errors: [{ message: 'name already exists on this account' }] })
  } }), error => error.status === 422 && /name already exists/.test(error.message))
  assert.equal(calls, 1)
})

test('create missing Playground before generation with the user token', async () => {
  let exists = false
  const writes = []
  const result = await generateIssue({ user, prompt: 'Create a maze game', origin: 'https://omgithub.com', config: {}, requestGithub: async (path, token, options = {}) => {
    assert.equal(token, user.token)
    if (path === '/repos/player/PlayGround') { if (!exists) throw missing(); return repository }
    if (options.method) writes.push(path)
    if (path === '/user/repos') {
      assert.deepEqual(JSON.parse(options.body), { name: 'PlayGround', private: false, auto_init: true, has_issues: true })
      exists = true; return repository
    }
    if (path.endsWith('/commits/main')) return { sha: 'a'.repeat(40) }
    if (path.endsWith('/issues')) return { number: 1 }
    return {}
  } })
  assert.equal(result.omgithub_path, '/player/PlayGround/issues/1')
  assert.equal(writes[0], '/user/repos')
})

test('reject private, archived, disabled, non-writable, and issue-disabled Playground without writes', async () => {
  for (const change of [{ private: true }, { archived: true }, { disabled: true }, { permissions: {} }, { has_issues: false }, { default_branch: '' }]) {
    await assert.rejects(() => ensurePlayground({ user, requestGithub: async (path, token, options) => {
      assert.equal(options, undefined)
      return { ...repository, ...change }
    } }), error => [403, 409].includes(error.status))
  }
})

test('reuse Playground when a concurrent request creates it', async () => {
  let lookups = 0
  const result = await ensurePlayground({ user, requestGithub: async (path) => {
    if (path === '/user/repos') throw Object.assign(new Error('Already exists'), { status: 422 })
    if (path === '/repos/player/PlayGround' && lookups++ === 0) throw missing()
    return repository
  } })
  assert.equal(result.full_name, repository.full_name)
})
