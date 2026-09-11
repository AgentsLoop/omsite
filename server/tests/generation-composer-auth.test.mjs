import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('redirects unauthenticated composer submission to GitHub sign-in before validating the prompt', async () => {
  const component = await readFile(new URL('../../src/components/GenerationComposer.vue', import.meta.url), 'utf8')
  const signIn = component.indexOf("if (!props.me) { window.location.assign('/auth/github'); return }")
  const validation = component.indexOf('if (prompt.value.trim().length < 8 || prompt.value.trim().length > 12000)')

  assert.ok(signIn >= 0, 'the composer must redirect an unauthenticated submission to sign-in')
  assert.ok(signIn < validation, 'the composer must redirect before prompt validation blocks Enter')
})
