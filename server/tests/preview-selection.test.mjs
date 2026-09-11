import test from 'node:test'
import assert from 'node:assert/strict'
import * as previewSelection from '../../src/preview-selection.mjs'

const { selectPreview } = previewSelection
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

test('switching from chat to preview advances the preview frame key', () => {
  assert.deepEqual(previewSelection.switchWorkspacePane?.('chat', 'preview', 4), {
    pane: 'preview',
    previewFrameKey: 5
  })
})

test('refreshing the preview advances the preview frame key', () => {
  assert.equal(previewSelection.refreshPreviewFrame?.(4), 5)
})
