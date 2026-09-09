export const CATALOG_METADATA_FILE = '.omgithub-metadata.json'
export const MAX_METADATA_BYTES = 256 * 1024
const descriptionSources = new Set(['github', 'html', 'opencode', 'manual'])
const promptSources = new Set(['github-file', 'github-list', 'issue', 'workflow', 'manual', 'opencode-reconstructed'])
const aliases = { threejs: 'three.js', 'three-js': 'three.js', 'three.js': 'three.js', 'godot-engine': 'godot', 'play-canvas': 'playcanvas', 'gpt-6-astra': 'astra' }
const fail = message => { throw Object.assign(new Error(`Invalid catalog metadata: ${message}`), { status: 422 }) }

function httpsUrl(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048) fail(field)
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password) fail(field)
    return url.href
  } catch { fail(field) }
}

export function normalizeScreenshotEmbeddings(values = []) {
  if (!Array.isArray(values) || values.length > 8) fail('screenshot_embeddings')
  return [...new Set(values.map(value => httpsUrl(value, 'screenshot_embeddings')))]
}

export function normalizeTags(...groups) {
  return [...new Set(groups.flat().filter(value => typeof value === 'string').map(value => {
    const tag = value.trim().toLowerCase().replace(/\s+/g, '-')
    return aliases[tag] || tag
  }).filter(tag => /^[a-z0-9][a-z0-9.+#-]{0,47}$/.test(tag)))].slice(0, 64)
}

export function validateManualPublishMetadata(input, { sourceUrl = '' } = {}) {
  if (input === undefined || input === null) return {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('manual publish metadata must be an object')
  const metadata = {}
  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 160) fail('title')
    metadata.title = input.title.trim()
  }
  if (input.description !== undefined) {
    if (typeof input.description !== 'string' || !input.description.trim() || input.description.length > 500) fail('description')
    metadata.description = input.description.trim()
    metadata.description_source = 'manual'
  }
  if (input.tags !== undefined) {
    if (!Array.isArray(input.tags) || input.tags.length > 64 || input.tags.some(tag => typeof tag !== 'string' || tag.length > 100)) fail('tags')
    metadata.tags = normalizeTags(input.tags)
  }
  if (input.screenshot_embeddings !== undefined) metadata.screenshot_embeddings = normalizeScreenshotEmbeddings(input.screenshot_embeddings)
  if (input.source !== undefined) metadata.source = httpsUrl(input.source, 'source')
  if (input.prompt !== undefined) {
    if (typeof input.prompt !== 'string' || input.prompt.length > 60000) fail('prompt')
    if (input.prompt.trim()) {
      const promptSourceUrl = String(input.prompt_source_url || sourceUrl).trim()
      if (!/^https:\/\/[^\s]+$/.test(promptSourceUrl)) fail('prompt_source_url')
      metadata.prompt = input.prompt.trim()
      metadata.prompt_source = 'manual'
      metadata.prompt_source_url = promptSourceUrl
    }
  }
  if (Object.keys(metadata).length) Object.assign(metadata, { metadata_source: 'manual', metadata_updated_at: new Date().toISOString() })
  return metadata
}

export function validateCatalogMetadata(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('expected an object')
  if (input.schema_version !== 1) fail('unsupported schema version')
  if (typeof input.description !== 'string' || !input.description.trim() || input.description.length > 500) fail('description is required (maximum 500 characters)')
  if (!descriptionSources.has(input.description_source)) fail('description_source')
  if (!Number.isInteger(input.complexity_score) || input.complexity_score < 1 || input.complexity_score > 10) fail('complexity_score must be 1–10')
  if (!Array.isArray(input.tags) || input.tags.length > 64 || input.tags.some(tag => typeof tag !== 'string' || tag.length > 100)) fail('tags')
  let runtime_flops = null
  if (input.runtime_flops != null) {
    const estimate = input.runtime_flops
    if (!estimate || typeof estimate !== 'object' || Array.isArray(estimate) ||
        !Number.isFinite(estimate.flops) || estimate.flops <= 0 ||
        estimate.target_fps !== 60 || estimate.width !== 1920 || estimate.height !== 1080 ||
        estimate.source !== 'opencode' || typeof estimate.assumptions !== 'string' ||
        !estimate.assumptions.trim() || estimate.assumptions.length > 1500) fail('runtime_flops')
    runtime_flops = { flops: estimate.flops, target_fps: 60, width: 1920, height: 1080,
      source: 'opencode', assumptions: estimate.assumptions.trim() }
  }
  const prompt = input.prompt ?? ''
  if (typeof prompt !== 'string' || prompt.length > 60000) fail('prompt')
  const sourceUrl = input.prompt_source_url || ''
  if (prompt && (!promptSources.has(input.prompt_source) || !/^https:\/\/[^\s]+$/.test(sourceUrl))) fail('prompt provenance is required')
  if (!Array.isArray(input.metadata_evidence) || input.metadata_evidence.length > 128) fail('metadata_evidence')
  const evidence = input.metadata_evidence.map(item => {
    if (!item || !['description', 'tags', 'complexity_score', 'prompt', 'runtime_flops'].includes(item.field) || typeof item.file !== 'string' || !item.file || item.file.startsWith('/') || item.file.includes('\\') || item.file.split('/').some(part => part === '..' || part === '.') || !Number.isInteger(item.line_start) || item.line_start < 1 || !Number.isInteger(item.line_end) || item.line_end < item.line_start) fail('evidence reference')
    return { field: item.field, file: item.file, line_start: item.line_start, line_end: item.line_end }
  })
  for (const field of ['complexity_score', ...(runtime_flops ? ['runtime_flops'] : []), ...(input.description_source === 'opencode' ? ['description'] : []), ...(prompt ? ['prompt'] : []), ...(input.tags.length ? ['tags'] : [])]) {
    if (!evidence.some(item => item.field === field)) fail(`missing ${field} evidence`)
  }
  if (!['opencode', 'github-list', 'manual', 'import'].includes(input.metadata_source)) fail('metadata_source')
  if (typeof input.metadata_updated_at !== 'string' || !Number.isFinite(Date.parse(input.metadata_updated_at))) fail('metadata_updated_at')
  return { schema_version: 1, description: input.description.trim(), description_source: input.description_source,
    prompt, prompt_source: prompt ? input.prompt_source : '', prompt_source_url: prompt ? sourceUrl : '',
    runtime_flops, tags: normalizeTags(input.tags), complexity_score: input.complexity_score, metadata_source: input.metadata_source,
    metadata_updated_at: input.metadata_updated_at, metadata_evidence: evidence, metadata_incomplete: !prompt }
}

export function readCatalogMetadata(entries, root = '') {
  const matches = entries.filter(entry => !entry.isDirectory && entry.entryName.replaceAll('\\', '/') === `${root}${CATALOG_METADATA_FILE}`)
  if (!matches.length) return null
  if (matches.length !== 1 || matches[0].header.size > MAX_METADATA_BYTES) fail('duplicate or oversized reserved file')
  const bytes = matches[0].getData()
  if (bytes.length > MAX_METADATA_BYTES) fail('reserved file too large')
  let input
  try { input = JSON.parse(bytes.toString('utf8')) } catch { fail('reserved file must contain JSON') }
  return validateCatalogMetadata(input)
}

export function mergeCatalogMetadata({ existing = {}, extracted = {}, manual = {}, htmlDescription = '', repositoryDescription = '', topics = [] } = {}) {
  const result = { ...extracted }
  // Retain imported and manual source values on a repeat publication.
  for (const field of ['description', 'description_source', 'source', 'screenshot_embeddings']) {
    if (existing[field]) result[field] = existing[field]
  }
  if (existing.prompt && (existing.prompt_source !== 'opencode-reconstructed' || !extracted.prompt)) {
    for (const field of ['prompt', 'prompt_source', 'prompt_source_url']) result[field] = existing[field] || ''
  }
  if (!existing.description && htmlDescription) Object.assign(result, { description: htmlDescription, description_source: 'html' })
  else if (!existing.description && repositoryDescription) Object.assign(result, { description: repositoryDescription, description_source: 'github' })
  Object.assign(result, manual)
  result.tags = normalizeTags(topics, existing.tags || [], extracted.tags || [], manual.tags || [])
  result.metadata_incomplete = !result.prompt
  return result
}

export function publicCatalogMetadata(project) {
  const { complexity_score, metadata_evidence, metadata_audit, rating_sum, local_dir, source, screenshot_embeddings, ...safe } = project
  return safe
}
