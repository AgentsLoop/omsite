import test from 'node:test'
import assert from 'node:assert/strict'
import { selectPreview } from '../../src/preview-selection.mjs'
test('advances stages and preserves manual choices between updates', () => {
  const files = { project_files_url: 'files', screenshots: [] }
  const shots = { ...files, screenshots: ['one'] }
  const game = { ...shots, preview_url: 'game' }
  assert.equal(selectPreview(files, null, ''), 'files')
  assert.equal(selectPreview(shots, files, 'files'), 'one')
  assert.equal(selectPreview(shots, shots, 'files'), 'files')
  assert.equal(selectPreview(game, shots, 'one'), 'game')
  assert.equal(selectPreview(game, game, 'one'), 'one')
})
