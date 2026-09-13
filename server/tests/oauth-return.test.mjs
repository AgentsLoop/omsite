import assert from 'node:assert/strict'
import test from 'node:test'
import { oauthReturnFromReferer, validateOAuthReturn } from '../lib/oauth-return.mjs'

test('accepts local OAuth return paths with query strings and fragments', () => {
  assert.equal(validateOAuthReturn('/games?tag=arcade#featured'), '/games?tag=arcade#featured')
  assert.equal(validateOAuthReturn('/'), '/')
})

test('rejects external, malformed, and OAuth-loop return targets', () => {
  for (const value of ['https://evil.example/', '//evil.example/', '/%2F%2Fevil.example/', '/\\evil', '/%5Cevil', 'games', '/auth/github', '/auth/github/callback?again=1', '/auth/github/', '/%61uth/github', '/page%0d%0aLocation:%20https://evil.example/']) {
    assert.equal(validateOAuthReturn(value), '', value)
  }
})

test('uses only a same-origin Referer as the OAuth return fallback', () => {
  const origin = 'https://omgithub.example'
  assert.equal(oauthReturnFromReferer('https://omgithub.example/projects?sort=new#top', origin), '/projects?sort=new#top')
  assert.equal(oauthReturnFromReferer('https://evil.example/projects', origin), '')
  assert.equal(oauthReturnFromReferer('not a URL', origin), '')
  assert.equal(oauthReturnFromReferer('https://omgithub.example/auth/github', origin), '')
})
