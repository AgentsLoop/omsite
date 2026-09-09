import assert from 'node:assert/strict'
import test from 'node:test'
import AdmZip from 'adm-zip'
import { CATALOG_METADATA_FILE, validateCatalogMetadata, validateManualPublishMetadata, normalizeTags, normalizeScreenshotEmbeddings, mergeCatalogMetadata, publicCatalogMetadata, readCatalogMetadata } from '../lib/catalog-metadata.mjs'
import { validateSourceEvidence, validateSourceEvidenceOrDropPrompt } from '../../scripts/extract-catalog-metadata.mjs'

const metadata = () => ({ schema_version: 1, description: 'Move a cube through a maze.', description_source: 'opencode', prompt: '', tags: ['ThreeJS', 'game'], complexity_score: 4, metadata_source: 'opencode', metadata_updated_at: '2026-09-09T00:00:00.000Z', metadata_evidence: ['description', 'tags', 'complexity_score'].map(field => ({ field, file: 'game.js', line_start: 1, line_end: 1 })) })

test('normalizes one tag array and validates evidence-backed metadata', () => {
  assert.deepEqual(normalizeTags([' ThreeJS ', 'FPS'], ['three-js', 'fps', '<script>']), ['three.js', 'fps'])
  assert.equal(validateCatalogMetadata(metadata()).metadata_incomplete, true)
  for (const complexity_score of [0, 11, 2.5, '4']) assert.throws(() => validateCatalogMetadata({ ...metadata(), complexity_score }))
  assert.throws(() => validateCatalogMetadata({ ...metadata(), metadata_evidence: [] }), /evidence/)
  assert.throws(() => validateCatalogMetadata({ ...metadata(), description: '' }), /description/)
  assert.throws(() => validateCatalogMetadata({ ...metadata(), prompt: 'Invented prompt' }), /provenance/)
})

test('checks source lines and rejects invented original prompts', () => {
  const input = { ...metadata(), prompt: 'Make a maze.', prompt_source: 'github-file', prompt_source_url: 'https://github.com/o/r', metadata_evidence: [...metadata().metadata_evidence, { field: 'prompt', file: 'README.md', line_start: 1, line_end: 1 }] }
  const files = { 'game.js': 'maze()', 'README.md': 'Original prompt: Make a maze.' }
  assert.match(validateSourceEvidence(input, files, 'https://github.com/o/r/blob/sha').prompt_source_url, /README.md#L1-L1$/)
  assert.throws(() => validateSourceEvidence({ ...input, prompt: 'Make a shooter.' }, files, 'https://github.com/o/r'), /exactly/)
  assert.throws(() => validateSourceEvidence(input, { ...files, 'game.js': undefined }, 'https://github.com/o/r'), /outside/)
  const withoutInventedPrompt = validateSourceEvidenceOrDropPrompt({ ...input, prompt: 'Make a shooter.' }, files, 'https://github.com/o/r')
  assert.equal(withoutInventedPrompt.prompt, '')
  assert.equal(withoutInventedPrompt.prompt_source_url, '')
  assert.equal(withoutInventedPrompt.metadata_evidence.some(item => item.field === 'prompt'), false)
})

test('preserves imported source metadata and keeps private fields out of projection', () => {
  const existing = { description: 'Source description', description_source: 'manual', prompt: 'Source prompt', prompt_source: 'github-list', prompt_source_url: 'https://github.com/list', tags: ['fps'] }
  const merged = mergeCatalogMetadata({ existing, extracted: metadata(), htmlDescription: 'HTML', topics: ['FPS', 'astra'] })
  assert.equal(merged.description, existing.description)
  assert.equal(merged.prompt_source_url, existing.prompt_source_url)
  assert.deepEqual(merged.tags, ['fps', 'astra', 'three.js', 'game'])
  const safe = publicCatalogMetadata(merged)
  assert.equal('complexity_score' in safe, false)
  assert.equal('metadata_evidence' in safe, false)
})

test('accepts optional manual publish metadata and keeps prompt provenance', () => {
  const manual = validateManualPublishMetadata({
    description: 'A reviewed browser game.', tags: ['ThreeJS', 'arcade'], prompt: 'Build a small arcade game.',
    prompt_source_url: 'https://github.com/example/game/blob/main/PROMPT.md',
    screenshot_embeddings: ['https://raw.githubusercontent.com/example/game/main/screenshot.png'],
    source: 'https://github.com/example/awesome-games'
  }, { sourceUrl: 'https://github.com/example/game/tree/main/game' })
  assert.deepEqual(manual.tags, ['three.js', 'arcade'])
  assert.equal(manual.prompt_source, 'manual')
  assert.equal(manual.description_source, 'manual')
  assert.equal(manual.screenshot_embeddings.length, 1)
  assert.equal(manual.source, 'https://github.com/example/awesome-games')
  assert.throws(() => validateManualPublishMetadata({ prompt: 'No source' }), /prompt_source_url/)
  assert.throws(() => normalizeScreenshotEmbeddings(['http://example.com/image.png']), /screenshot_embeddings/)
  assert.throws(() => validateManualPublishMetadata({ source: 'not a URL' }), /source/)
})

test('keeps discovery provenance private while exposing embedded screenshots through the gallery', () => {
  const safe = publicCatalogMetadata({ source: 'https://github.com/example/list', screenshot_embeddings: ['https://example.com/game.png'], screenshots: ['https://example.com/game.png'] })
  assert.equal('source' in safe, false)
  assert.equal('screenshot_embeddings' in safe, false)
  assert.deepEqual(safe.screenshots, ['https://example.com/game.png'])
})

test('reads reserved metadata and rejects invalid JSON before deployment', () => {
  const zip = new AdmZip()
  zip.addFile(CATALOG_METADATA_FILE, Buffer.from(JSON.stringify(metadata())))
  assert.equal(readCatalogMetadata(zip.getEntries()).complexity_score, 4)
  zip.updateFile(CATALOG_METADATA_FILE, Buffer.from('{invalid'))
  assert.throws(() => readCatalogMetadata(zip.getEntries()), /JSON/)
})

test('validates OC runtime estimates, requires evidence, and exposes them publicly', () => {
  const runtime_flops = { flops: 1.2e9, target_fps: 60, width: 1920, height: 1080, source: 'opencode', assumptions: 'About 20 million operations per frame; typical scene, uncertain shader load.' }
  const input = { ...metadata(), runtime_flops, metadata_evidence: [...metadata().metadata_evidence, { field: 'runtime_flops', file: 'game.js', line_start: 1, line_end: 1 }] }
  const result = validateSourceEvidence(input, { 'game.js': 'render()' }, 'https://github.com/o/r')
  assert.deepEqual(publicCatalogMetadata(result).runtime_flops, runtime_flops)
  assert.equal(validateCatalogMetadata(metadata()).runtime_flops, null)
  assert.throws(() => validateCatalogMetadata({ ...input, metadata_evidence: metadata().metadata_evidence }), /missing runtime_flops evidence/)
  for (const patch of [{ flops: 0 }, { flops: -1 }, { flops: Infinity }, { flops: '1000' }, { target_fps: 30 }, { width: 800 }, { height: 600 }, { source: 'manual' }, { assumptions: '' }]) {
    assert.throws(() => validateCatalogMetadata({ ...input, runtime_flops: { ...runtime_flops, ...patch } }), /runtime_flops/)
  }
})

test('formats runtime work with explicit FLOPS units', async () => {
  const { formatFlops } = await import('../../src/lib/runtime-flops.mjs')
  assert.equal(formatFlops(1.2e9), '1.2 GFLOPS')
  assert.equal(formatFlops(2e12), '2 TFLOPS')
  assert.equal(formatFlops(500), '500 FLOPS')
  assert.equal(formatFlops(null), 'not estimated')
})

test('accepts reconstructed prompts with source evidence without claiming an exact quotation', () => {
  const input = { ...metadata(), prompt: 'Build a maze game with arrow-key movement.', prompt_source: 'opencode-reconstructed', prompt_source_url: 'https://github.com/o/r', metadata_evidence: [...metadata().metadata_evidence, { field: 'prompt', file: 'game.js', line_start: 1, line_end: 1 }] }
  const result = validateSourceEvidence(input, { 'game.js': 'function movePlayer() {}' }, 'https://github.com/o/r/blob/sha')
  assert.equal(result.prompt, input.prompt)
  assert.equal(result.prompt_source, 'opencode-reconstructed')
  assert.equal(result.prompt_source_url, 'https://github.com/o/r/blob/sha/game.js#L1-L1')
  assert.equal(result.metadata_incomplete, false)
  assert.equal(publicCatalogMetadata(result).prompt_source, 'opencode-reconstructed')
  assert.throws(() => validateSourceEvidence(input, { 'game.js': undefined }, 'https://github.com/o/r'), /outside/)
  assert.throws(() => validateCatalogMetadata({ ...input, metadata_evidence: metadata().metadata_evidence }), /missing prompt evidence/)
})

test('preserves recorded prompts but refreshes reconstructed prompts as one provenance group', () => {
  const reconstructed = { prompt: 'Recreate the maze.', prompt_source: 'opencode-reconstructed', prompt_source_url: 'https://github.com/o/r/blob/old/game.js' }
  const original = { prompt: 'Make my maze.', prompt_source: 'github-file', prompt_source_url: 'https://github.com/o/r/blob/new/PROMPT.md' }
  assert.equal(mergeCatalogMetadata({ existing: original, extracted: reconstructed }).prompt, original.prompt)
  const replaced = mergeCatalogMetadata({ existing: reconstructed, extracted: original })
  for (const field of ['prompt', 'prompt_source', 'prompt_source_url']) assert.equal(replaced[field], original[field])
  assert.equal(mergeCatalogMetadata({ existing: reconstructed }).prompt, reconstructed.prompt)
  const filled = mergeCatalogMetadata({ existing: { prompt: '', prompt_source: 'manual', prompt_source_url: 'https://example.com/stale' }, extracted: reconstructed })
  assert.equal(filled.prompt_source, 'opencode-reconstructed')
  assert.equal(filled.prompt_source_url, reconstructed.prompt_source_url)
})
