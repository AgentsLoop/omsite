import assert from 'node:assert/strict'
import test from 'node:test'
import AdmZip from 'adm-zip'
import { CATALOG_METADATA_FILE, validateCatalogMetadata, validateManualPublishMetadata, normalizeTags, normalizeScreenshotEmbeddings, mergeCatalogMetadata, publicCatalogMetadata, readCatalogMetadata } from '../lib/catalog-metadata.mjs'
import { validateSourceEvidence } from '../../scripts/extract-catalog-metadata.mjs'

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
