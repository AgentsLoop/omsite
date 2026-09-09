import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { findDeployableRoot, recoveryProjectUrl, recoveryPrompt } from '../../scripts/recover-game-build.mjs'

const env = {
  OMGHITHUB_SOURCE_OWNER: 'owner',
  OMGHITHUB_SOURCE_REPO: 'games',
  OMGHITHUB_SOURCE_SHA: 'a'.repeat(40),
  OMGHITHUB_SOURCE_PATH: 'collection/game-one',
  OMGHITHUB_SOURCE_ENTRY: ''
}

test('build recovery gives OpenCode the exact immutable game link and selected path', () => {
  assert.equal(recoveryProjectUrl(env), `https://github.com/owner/games/tree/${'a'.repeat(40)}/collection/game-one`)
  const prompt = recoveryPrompt(env)
  assert.match(prompt, /Inspect the selected game path "collection\/game-one"/)
  assert.match(prompt, /Do not include unrelated sibling games/)
  assert.match(prompt, /install required dependencies/)
  assert.match(prompt, /screenshots\/final-build\.png/)
})

test('build recovery finds child and parent multi-page outputs', () => {
  const source = mkdtempSync(join(tmpdir(), 'omgithub-recovery-test-'))
  mkdirSync(join(source, 'collection', 'game-one', 'dist'), { recursive: true })
  writeFileSync(join(source, 'collection', 'game-one', 'dist', 'index.html'), '<!doctype html>')
  assert.equal(findDeployableRoot(source, 'collection/game-one'), join(source, 'collection', 'game-one', 'dist'))

  const second = mkdtempSync(join(tmpdir(), 'omgithub-recovery-test-'))
  mkdirSync(join(second, 'collection', 'game-one'), { recursive: true })
  mkdirSync(join(second, 'collection', 'dist', 'game-one'), { recursive: true })
  writeFileSync(join(second, 'collection', 'dist', 'game-one', 'index.html'), '<!doctype html>')
  assert.equal(findDeployableRoot(second, 'collection/game-one'), join(second, 'collection', 'dist', 'game-one'))
})

test('build recovery rejects source traversal', () => {
  assert.throws(() => recoveryPrompt({ ...env, OMGHITHUB_SOURCE_PATH: '../other' }), /Invalid source path/)
})
