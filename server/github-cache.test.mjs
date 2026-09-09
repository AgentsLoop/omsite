import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGithubCache } from './github-cache.mjs'

test('GitHub cache persists metadata across instances and reuses stale data on rate limits', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'omgithub-cache-'))
  let calls = 0
  const url = 'https://api.github.com/repos/owner/repo'
  const cached = createGithubCache(directory, { requestFetch: async () => { calls++; return Response.json({ topics: ['game'] }) } })
  const results = await Promise.all([cached(url), cached(url)])
  assert.equal(calls, 1)
  assert.deepEqual(await results[0].json(), { topics: ['game'] })
  assert.deepEqual(await results[1].json(), { topics: ['game'] })
  const restarted = createGithubCache(directory, { requestFetch: async () => { throw new Error('Must use disk cache') } })
  assert.equal((await restarted(url)).status, 200)
  const expired = createGithubCache(directory, { ttlMs: -1, requestFetch: async () => new Response('Rate limited', { status: 429 }) })
  assert.deepEqual(await (await expired(url)).json(), { topics: ['game'] })
})
