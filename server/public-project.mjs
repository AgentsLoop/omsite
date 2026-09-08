import AdmZip from 'adm-zip'
import { createHash, randomUUID } from 'node:crypto'
import { rename } from 'node:fs/promises'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'

const API = 'https://api.github.com'
const MAX_ARCHIVE_BYTES = 80 * 1024 * 1024
const MAX_ENTRIES = 5000
const MAX_ENTRY_BYTES = 25 * 1024 * 1024
const MAX_TOTAL_BYTES = 100 * 1024 * 1024

function apiHeaders() {
  return {
    accept: 'application/vnd.github+json',
    'user-agent': 'OmGithub',
    'x-github-api-version': '2022-11-28'
  }
}

async function githubPublic(path, requestFetch) {
  const response = await requestFetch(`${API}${path}`, { headers: apiHeaders() })
  const text = await response.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) throw Object.assign(new Error(data?.message || `GitHub returned ${response.status}`), { status: response.status })
  return data
}

function validateRepository(owner, repo) {
  if (!/^[a-z0-9_.-]+$/i.test(owner) || !/^[a-z0-9_.-]+$/i.test(repo)) throw Object.assign(new Error('Invalid public repository path'), { status: 400 })
}

export function validateSource(owner, repo, sha) {
  validateRepository(owner, repo)
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw Object.assign(new Error('A full 40-character commit SHA is required'), { status: 400 })
}

export function validateProjectPath(projectPath = '') {
  const value = String(projectPath || '').replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  if (!value) return ''
  if (value.split('/').some(part => !part || part === '.' || part === '..')) throw Object.assign(new Error('Invalid project directory'), { status: 400 })
  return value
}

export async function resolvePublicCommit({ owner, repo, ref, requestFetch = fetch }) {
  validateRepository(owner, repo)
  if (!String(ref || '').trim() || String(ref).includes('..') || String(ref).includes('/')) throw Object.assign(new Error('Invalid Git ref'), { status: 400 })
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const repository = await githubPublic(base, requestFetch)
  if (repository.private) throw Object.assign(new Error('Only public repositories are supported'), { status: 404 })
  const commit = await githubPublic(`${base}/commits/${encodeURIComponent(ref)}`, requestFetch)
  return { sha: commit.sha, repository, commit }
}

export async function resolveLatestPublicCommit({ owner, repo, requestFetch = fetch }) {
  validateRepository(owner, repo)
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const repository = await githubPublic(base, requestFetch)
  if (repository.private) throw Object.assign(new Error('Only public repositories are supported'), { status: 404 })
  const branch = repository.default_branch || 'main'
  const commit = await githubPublic(`${base}/commits/${encodeURIComponent(branch)}`, requestFetch)
  return { sha: commit.sha, repository, commit }
}

function projectSlug(owner, repo, sha, projectPath = '') {
  const prefix = `${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
  const pathHash = projectPath ? `-${createHash('sha256').update(projectPath).digest('hex').slice(0, 8)}` : ''
  return `${prefix || 'project'}-${sha.slice(0, 12).toLowerCase()}${pathHash}`
}

function normalizedEntryName(entryName) {
  const normalized = entryName.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error(`Unsafe ZIP entry: ${entryName}`)
  return normalized
}

function archiveRoot(entries) {
  const names = entries.filter(entry => !entry.isDirectory).map(entry => normalizedEntryName(entry.entryName))
  const roots = new Set(names.filter(name => name.includes('/')).map(name => name.split('/')[0]))
  if (roots.size !== 1 || names.some(name => !name.includes('/'))) return ''
  const root = [...roots][0]
  return `${root}/`
}

function relativeZipName(entryName, root = '') {
  const normalized = normalizedEntryName(entryName)
  if (!root) return normalized
  if (normalized === root.slice(0, -1)) return ''
  return normalized.startsWith(root) ? normalized.slice(root.length) : ''
}

function deploymentRoot(entries, root, projectPath = '') {
  const files = new Set(entries.filter(entry => !entry.isDirectory).map(entry => relativeZipName(entry.entryName, root)))
  const prefix = projectPath ? `${projectPath}/` : ''
  if (files.has(`${prefix}dist/index.html`)) return `${prefix}dist/`
  if (files.has(`${prefix}index.html`)) return prefix
  throw Object.assign(new Error('Public commit must contain dist/index.html or index.html'), { status: 422 })
}

function deploymentOutputName(entry, root, archiveRootPath, includeScreenshots = false) {
  if (entry.isDirectory) return ''
  const relative = relativeZipName(entry.entryName, archiveRootPath)
  if (!relative.startsWith(root)) return ''
  const outputName = relative.slice(root.length)
  if (!outputName) return ''
  const first = outputName.split('/')[0]
  if (first.startsWith('.') || first === 'node_modules') return ''
  if (!includeScreenshots && first === 'screenshots') return ''
  return outputName
}

function extractDeployment(zip, destination, includeScreenshots = false, projectPath = '') {
  const entries = zip.getEntries()
  if (entries.length > MAX_ENTRIES) throw new Error('Repository archive contains too many entries')
  const archiveRootPath = archiveRoot(entries)
  const root = deploymentRoot(entries, archiveRootPath, projectPath)
  let total = 0
  for (const entry of entries) {
    normalizedEntryName(entry.entryName)
    if (!deploymentOutputName(entry, root, archiveRootPath, includeScreenshots)) continue
    const size = Number(entry.header.size)
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ENTRY_BYTES) throw new Error(`Repository file exceeds the ${MAX_ENTRY_BYTES} byte limit`)
    total += size
    if (total > MAX_TOTAL_BYTES) throw new Error('Repository content exceeds the total size limit')
  }

  const staging = `${destination}.staging-${randomUUID()}`
  mkdirSync(staging, { recursive: true })
  try {
    for (const entry of entries) {
      const outputName = deploymentOutputName(entry, root, archiveRootPath, includeScreenshots)
      if (!outputName) continue
      const output = resolve(staging, outputName)
      if (!output.startsWith(`${resolve(staging)}${sep}`)) throw new Error(`Unsafe deployment path: ${outputName}`)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, entry.getData())
    }
    return { staging, root }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

function screenshotUrls(entries, owner, repo, sha, { baseHost = '', slug = '', built = false, deploymentRoot = '' } = {}) {
  const root = archiveRoot(entries)
  return entries
    .filter(entry => !entry.isDirectory)
    .map(entry => built ? deploymentOutputName(entry, deploymentRoot, root, true) : relativeZipName(entry.entryName, root))
    .filter(name => /(^|\/)screenshots\/final-[^/]+\.(png|jpe?g|webp)$/i.test(name))
    .sort()
    .map(name => built
      ? `https://${slug}.${baseHost}/${name.split('/').map(encodeURIComponent).join('/')}`
      : `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${sha}/${name.split('/').map(encodeURIComponent).join('/')}`)
}

function decodeHtml(value) {
  return String(value || '').replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[entity]))
}

function pageMetadata(indexPath) {
  const html = readFileSync(indexPath, 'utf8')
  const title = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]).replace(/<[^>]+>/g, '').trim()
  const description = decodeHtml(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["'][^>]*>/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["'][^>]*>/i)?.[1]
  ).trim()
  return { title, description }
}

export async function materializePublicProject({ owner, repo, sha, baseHost, gamesDir, store, requestFetch = fetch, archiveBuffer = null, buildRunId = '', projectPath = '', publicPath = '' }) {
  validateSource(owner, repo, sha)
  projectPath = validateProjectPath(projectPath)
  publicPath = String(publicPath || '').trim()
  if (publicPath && (!publicPath.startsWith('/') || publicPath.includes('..'))) throw Object.assign(new Error('Invalid public project path'), { status: 400 })
  const sourceKey = `${owner.toLowerCase()}/${repo.toLowerCase()}@${sha.toLowerCase()}${projectPath ? `:${projectPath}` : ''}`
  const existing = await store.bySourceKey(sourceKey)
  if (existing && !archiveBuffer) return existing

  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const [repository, commit] = await Promise.all([
    githubPublic(base, requestFetch),
    githubPublic(`${base}/commits/${sha}`, requestFetch)
  ])
  if (repository.private) throw Object.assign(new Error('Only public repositories are supported'), { status: 404 })
  if (String(commit.sha).toLowerCase() !== sha.toLowerCase()) throw Object.assign(new Error('Commit SHA did not resolve exactly'), { status: 404 })

  let archive
  if (archiveBuffer) archive = Buffer.from(archiveBuffer)
  else {
    const archiveResponse = await requestFetch(`${API}${base}/zipball/${sha}`, { headers: apiHeaders() })
    if (!archiveResponse.ok) throw Object.assign(new Error(`GitHub archive returned ${archiveResponse.status}`), { status: archiveResponse.status })
    const declaredBytes = Number(archiveResponse.headers?.get?.('content-length') || 0)
    if (declaredBytes > MAX_ARCHIVE_BYTES) throw Object.assign(new Error('Repository archive is too large'), { status: 413 })
    archive = Buffer.from(await archiveResponse.arrayBuffer())
  }
  if (archive.length > MAX_ARCHIVE_BYTES) throw Object.assign(new Error('Repository archive is too large'), { status: 413 })

  const zip = new AdmZip(archive)
  const entries = zip.getEntries()
  const slug = projectSlug(owner, repo, sha, projectPath)
  const destination = resolve(gamesDir, slug)
  if (!destination.startsWith(`${resolve(gamesDir)}${sep}`)) throw new Error('Unsafe project destination')
  const extracted = extractDeployment(zip, destination, Boolean(archiveBuffer), archiveBuffer ? '' : projectPath)
  try {
    const metadata = pageMetadata(resolve(extracted.staging, 'index.html'))
    const legacyStorePath = `/${owner}/${repo}/tree/${sha.toLowerCase()}${projectPath ? `/${projectPath}` : ''}`
    const project = {
      id: createHash('sha256').update(sourceKey).digest('hex').slice(0, 20),
      source_key: sourceKey,
      slug,
      title: String(metadata.title || repository.name).slice(0, 160),
      description: String(metadata.description || repository.description || commit.commit?.message?.split('\n')[0] || 'Published from a public GitHub commit.').slice(0, 500),
      repo_owner: repository.owner?.login || owner,
      repo: repository.name || repo,
      commit: sha.toLowerCase(),
      owner_login: repository.owner?.login || owner,
      owner_avatar: repository.owner?.avatar_url || `https://github.com/${owner}.png`,
      screenshots: screenshotUrls(entries, owner, repo, sha, { baseHost, slug, built: Boolean(archiveBuffer), deploymentRoot: extracted.root }),
      status: 'published',
      build_method: archiveBuffer ? 'github-actions' : 'source',
      build_transport: archiveBuffer ? 'omgithub-zip' : 'source',
      build_run_id: buildRunId,
      url: `https://${slug}.${baseHost}`,
      install_url: `https://${slug}.${baseHost}/install`,
      public_path: publicPath || '',
      legacy_store_path: legacyStorePath,
      store_path: publicPath || legacyStorePath,
      github_url: `https://github.com/${owner}/${repo}/tree/${sha}${projectPath ? `/${projectPath}` : ''}`,
      published_at: new Date().toISOString(),
      local_dir: destination
    }
    rmSync(destination, { recursive: true, force: true })
    await rename(extracted.staging, destination)
    await store.put(project)
    return project
  } catch (error) {
    rmSync(extracted.staging, { recursive: true, force: true })
    throw error
  }
}

export async function materializeLatestPublicProject({ owner, repo, baseHost, gamesDir, store, requestFetch = fetch, publicPath = '' }) {
  const { sha } = await resolveLatestPublicCommit({ owner, repo, requestFetch })
  return materializePublicProject({ owner, repo, sha, baseHost, gamesDir, store, requestFetch, publicPath })
}
