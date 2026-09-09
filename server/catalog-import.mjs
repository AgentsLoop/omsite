import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createStore } from './store.mjs'
import { DEFAULT_LIMITS, applyPromptRecords, canonicalKey, createGithubCache, isDirectGameSource, normalizeSource, publishCandidate, readJson, recordKey, scanSource, writeJson } from './catalog-import-lib.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const HELP = `Import explicit GitHub game directories or HTML files without creating GitHub artifacts.

Run: node server/catalog-import.mjs [options]
  --dry-run                 Scan and save a report (default; no DB or publish writes)
  --publish                 Submit named public progress routes and resume pending builds
  --prompts                 Upsert extracted prompts through createStore
  --manifest FILE           Source manifest (default: scripts/catalog-sources.json)
  --report FILE             Resumable report (default: DATA_DIR/catalog-import-report.json)
  --cache-dir DIR           GitHub URL cache (default: DATA_DIR/catalog-import-cache)
  --origin URL              OmGithub origin (default: PUBLIC_ORIGIN or https://omgithub.com)
  --ttl-days N              Disk cache TTL (default: 30)
  --max-sources N           Total sources per report (default: 120)
  --max-files N             Metadata files per source (default: 16)
  --max-depth N             File depth under each selected path (default: 6)
  --attempts N              Progress requests per candidate per run (default: 6)
  --poll-ms N               Wait between progress requests (default: 5000; max: 60000)
  --refresh                 Rescan completed sources; keep valid cached GitHub responses
  --help                    Show this help

Set GITHUB_TOKEN. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64
for Firestore in --prompts mode. Otherwise use the local DATA_DIR store, as in backfill.
Keep the report and cache under DATA_DIR. Reuse the report to resume or change modes.
Use a new report or --refresh to scan again. Add only direct GitHub tree directory
or HTML blob links with kind game. Repository roots and catalog/list links are rejected.
--publish and --prompts may be combined. --dry-run cannot be combined with either.
`

export function parseArgs(argv, env = process.env) {
  const dataDir = resolve(env.DATA_DIR || './data')
  const options = { dataDir, manifest: resolve(root, 'scripts/catalog-sources.json'), report: resolve(dataDir, 'catalog-import-report.json'),
    cacheDir: resolve(dataDir, 'catalog-import-cache'), origin: env.PUBLIC_ORIGIN || 'https://omgithub.com', ttlDays: 30,
    limits: { ...DEFAULT_LIMITS }, attempts: 6, pollMs: 5000, publish: false, prompts: false, refresh: false }
  const values = { '--manifest': 'manifest', '--report': 'report', '--cache-dir': 'cacheDir', '--origin': 'origin', '--ttl-days': 'ttlDays', '--attempts': 'attempts', '--poll-ms': 'pollMs' }
  const limits = { '--max-sources': 'sources', '--max-files': 'files', '--max-depth': 'depth', '--max-links': 'links', '--link-depth': 'linkDepth', '--max-games': 'games' }
  let explicitDry = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help') { options.help = true; continue }
    if (arg === '--dry-run') { explicitDry = true; continue }
    if (['--publish', '--prompts', '--refresh'].includes(arg)) { options[arg.slice(2)] = true; continue }
    if (!values[arg] && !limits[arg]) throw new Error(`Unknown option: ${arg}`)
    const value = argv[++i]
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
    if (limits[arg]) options.limits[limits[arg]] = Number(value)
    else options[values[arg]] = ['ttlDays', 'attempts', 'pollMs'].includes(values[arg]) ? Number(value) : value
  }
  for (const [name, value] of Object.entries({ ...options.limits, ttlDays: options.ttlDays, attempts: options.attempts, pollMs: options.pollMs })) {
    if (!Number.isSafeInteger(value) || value < (['depth', 'linkDepth', 'pollMs'].includes(name) ? 0 : 1)) throw new Error(`Invalid bound: ${name}`)
  }
  if (options.pollMs > 60000) throw new Error('--poll-ms must not exceed 60000')
  if (explicitDry && (options.publish || options.prompts)) throw new Error('--dry-run cannot be combined with write modes')
  const origin = new URL(options.origin)
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('--origin must be an HTTP(S) origin')
  options.origin = origin.origin
  for (const key of ['manifest', 'report', 'cacheDir']) options[key] = resolve(options[key])
  return options
}

export async function openImportStore(env = process.env) {
  const credentialText = env.FIREBASE_SERVICE_ACCOUNT_JSON || (env.FIREBASE_SERVICE_ACCOUNT_BASE64 ? Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8') : '')
  let firestore = null
  if (credentialText) {
    const { cert, getApps, initializeApp } = await import('firebase-admin/app')
    const { getFirestore } = await import('firebase-admin/firestore')
    const firebase = getApps()[0] || initializeApp({ credential: cert(JSON.parse(credentialText)) })
    firestore = getFirestore(firebase)
  }
  const store = createStore(resolve(env.DATA_DIR || './data'), firestore)
  // createStore.all() intentionally returns only 200 cards. Import must match older records too.
  const all = async () => {
    if (!firestore) return store.all()
    const rows = []
    let cursor = null
    while (true) {
      let query = firestore.collection('omgithub_projects').orderBy('__name__').limit(500)
      if (cursor) query = query.startAfter(cursor)
      const page = await query.get()
      rows.push(...page.docs.map(doc => ({ ...doc.data(), id: doc.id })))
      if (page.size < 500) return rows
      cursor = page.docs.at(-1)
    }
  }
  return { store, all }
}

export async function runImport(options, { env = process.env, requestFetch = fetch, importStore, log = console.log } = {}) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required')
  const manifest = await readJson(options.manifest, null)
  if (manifest?.version !== 1 || !Array.isArray(manifest.sources)) throw new Error('Use a version 1 source manifest')
  // Validate all supplied sources before a write or network request.
  const sources = manifest.sources.map(input => {
    const source = normalizeSource(input)
    if (!isDirectGameSource(source)) throw new Error('Use a direct GitHub tree directory or HTML blob link')
    return source
  })
  const report = await readJson(options.report, { version: 1, created_at: new Date().toISOString(), sources: {}, candidates: {}, prompts: [], pending: [], runs: [] })
  if (report.version !== 1) throw new Error('Unsupported report version')
  const run = { started_at: new Date().toISOString(), mode: [options.publish && 'publish', options.prompts && 'prompts'].filter(Boolean).join('+') || 'dry-run', errors: [], counts: { imported: 0, updated: 0, skipped: 0, duplicate: 0, unresolved: 0 } }
  report.runs.push(run)
  const save = async () => { report.updated_at = new Date().toISOString(); await writeJson(options.report, report) }
  // Do this before any GitHub request. Public cards are a useful fast path, not the DB match authority.
  let published = []
  try {
    const response = await requestFetch(`${options.origin}/api/projects`, { redirect: 'error', signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json()
    if (!Array.isArray(body.projects)) throw new Error('Invalid project list')
    published = body.projects.filter(row => !row.status || row.status === 'published')
  } catch (error) { run.errors.push({ stage: 'projects', error: error.message }) }
  let database = null
  if (options.prompts) {
    database = importStore || await openImportStore(env)
    published.push(...(await database.all()).filter(row => row.status === 'published'))
  }
  const publishedKeys = new Set(published.map(recordKey).filter(Boolean))
  const allowedCandidateKeys = new Set(sources.map(canonicalKey))
  const github = createGithubCache({ token: env.GITHUB_TOKEN, directory: options.cacheDir, ttlMs: options.ttlDays * 86400000, requestFetch })
  const queue = sources.map(source => ({ source, depth: 0 }))
  const visited = new Set()
  const promptKeys = new Set(report.prompts.map(item => `${item.target ? canonicalKey(item.target) : '?'}\0${item.prompt_source_url}\0${item.prompt}`))
  let processed = 0
  for (let index = 0; index < queue.length && processed < options.limits.sources; index++) {
    const { source, depth } = queue[index]
    const key = `${canonicalKey(source)}|${source.ref}|${source.kind}`
    if (visited.has(key)) { run.counts.duplicate++; continue }
    visited.add(key)
    processed++
    const previous = report.sources[key]
    // Reuse scan results across dry-run, publish, and prompts modes. Requeue saved links too.
    if (previous?.scan && !options.refresh) {
      run.counts.skipped++
      continue
    }
    if (source.kind === 'game' && publishedKeys.has(canonicalKey(source)) && !options.prompts) {
      report.sources[key] = { source, state: 'already-published' }
      run.counts.skipped++
      await save()
      continue
    }
    log(`Scan ${source.url}`)
    try {
      const scan = await scanSource(source, { github, limits: options.limits })
      report.sources[key] = { source: scan.source, state: scan.errors.length ? 'partial' : 'scanned', scan }
      for (const candidate of scan.candidates) {
        const candidateKey = canonicalKey(candidate)
        if (report.candidates[candidateKey]) { run.counts.duplicate++; continue }
        report.candidates[candidateKey] = { source: candidate, state: publishedKeys.has(candidateKey) ? 'published' : candidate.review_required ? 'review' : 'discovered' }
      }
      for (const prompt of scan.prompts) {
        const promptKey = `${prompt.target ? canonicalKey(prompt.target) : '?'}\0${prompt.prompt_source_url}\0${prompt.prompt}`
        if (promptKeys.has(promptKey)) { run.counts.duplicate++; continue }
        promptKeys.add(promptKey)
        report.prompts.push(prompt)
      }
      if (!scan.candidates.length && source.kind === 'game') report.sources[key].reason = 'No selected HTML or index.html found within scan bounds'
    } catch (error) { report.sources[key] = { source, state: 'failed', error: error.message }; run.errors.push({ source: source.url, error: error.message }) }
    await save()
  }
  run.source_limit_reached = processed >= options.limits.sources && queue.some(item => !visited.has(`${canonicalKey(item.source)}|${item.source.ref}|${item.source.kind}`))
  if (options.publish) {
    for (const [key, candidate] of Object.entries(report.candidates)) {
      if (!allowedCandidateKeys.has(key) && candidate.state !== 'published') {
        candidate.state = 'review'
        candidate.reason = 'Only direct tree directory and HTML blob links can publish automatically.'
        run.counts.skipped++
        await save()
        continue
      }
      if (candidate.state === 'review') { run.counts.skipped++; continue }
      if (candidate.state === 'published' || publishedKeys.has(key)) { candidate.state = 'published'; run.counts.skipped++; continue }
      try {
        log(`Publish ${key}`)
        candidate.publication = await publishCandidate(candidate.source, { origin: options.origin, requestFetch, attempts: options.attempts, pollMs: options.pollMs,
          onProgress: async progress => { candidate.publication = progress; candidate.state = progress.state; await save() } })
        candidate.state = candidate.publication.state
        if (candidate.state === 'published') { publishedKeys.add(key); run.counts.imported++ }
      } catch (error) { candidate.state = 'failed'; candidate.error = error.message; run.errors.push({ source: key, error: error.message }) }
      await save()
    }
  }
  if (options.prompts) {
    const result = await applyPromptRecords(report.prompts, database.store, await database.all())
    report.pending = result.pending
    for (const [key, count] of Object.entries(result.counts)) run.counts[key] += count
  } else {
    report.pending = report.prompts.filter(item => !item.target || !publishedKeys.has(canonicalKey(item.target)))
    run.counts.unresolved = report.pending.length
  }
  run.finished_at = new Date().toISOString()
  await save()
  log(`Report: ${options.report}\n${JSON.stringify(run.counts)}`)
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) console.log(HELP)
    else {
      const report = await runImport(options)
      if (report.runs.at(-1).errors.length || Object.values(report.sources).some(source => source.state === 'partial') || Object.values(report.candidates).some(candidate => candidate.state === 'failed')) process.exitCode = 1
    }
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
