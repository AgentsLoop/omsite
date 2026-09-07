import AdmZip from 'adm-zip'
import { createHash } from 'node:crypto'
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

function validateSource(owner, repo, sha) {
  if (!/^[a-z0-9_.-]+$/i.test(owner) || !/^[a-z0-9_.-]+$/i.test(repo)) throw Object.assign(new Error('Invalid public repository path'), { status: 400 })
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw Object.assign(new Error('A full 40-character commit SHA is required'), { status: 400 })
}

function projectSlug(owner, repo, sha) {
  const prefix = `${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
  return `${prefix || 'project'}-${sha.slice(0, 12).toLowerCase()}`
}

function relativeZipName(entryName) {
  const normalized = entryName.replaceAll('\\', '/')
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) throw new Error(`Unsafe ZIP entry: ${entryName}`)
  const slash = normalized.indexOf('/')
  return slash === -1 ? '' : normalized.slice(slash + 1)
}

function deploymentRoot(entries) {
  const files = new Set(entries.filter(entry => !entry.isDirectory).map(entry => relativeZipName(entry.entryName)))
  if (files.has('dist/index.html')) return 'dist/'
  if (files.has('index.html')) return ''
  throw Object.assign(new Error('Public commit must contain dist/index.html or index.html'), { status: 422 })
}

function deploymentOutputName(entry, root) {
  if (entry.isDirectory) return ''
  const relative = relativeZipName(entry.entryName)
  if (!relative.startsWith(root)) return ''
  const outputName = relative.slice(root.length)
  if (!outputName) return ''
  const first = outputName.split('/')[0]
  if (!root && (first.startsWith('.') || first === 'node_modules' || first === 'screenshots')) return ''
  if (first === 'screenshots') return ''
  return outputName
}

function extractDeployment(zip, destination) {
  const entries = zip.getEntries()
  if (entries.length > MAX_ENTRIES) throw new Error('Repository archive contains too many entries')
  const root = deploymentRoot(entries)
  let total = 0
  for (const entry of entries) {
    relativeZipName(entry.entryName)
    if (!deploymentOutputName(entry, root)) continue
    const size = Number(entry.header.size)
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ENTRY_BYTES) throw new Error(`Repository file exceeds the ${MAX_ENTRY_BYTES} byte limit`)
    total += size
    if (total > MAX_TOTAL_BYTES) throw new Error('Repository content exceeds the total size limit')
  }

  const staging = `${destination}.staging-${process.pid}-${Date.now()}`
  rmSync(staging, { recursive: true, force: true })
    mkdirSync(staging, { recursive: true })
  try {
    for (const entry of entries) {
      const outputName = deploymentOutputName(entry, root)
      if (!outputName) continue
      const output = resolve(staging, outputName)
      if (!output.startsWith(`${resolve(staging)}${sep}`)) throw new Error(`Unsafe deployment path: ${outputName}`)
      mkdirSync(dirname(output), { recursive: true })
      writeFileSync(output, entry.getData())
    }
    rmSync(destination, { recursive: true, force: true })
    mkdirSync(dirname(destination), { recursive: true })
    return { staging, root }
  } catch (error) {
    rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

function screenshotUrls(entries, owner, repo, sha) {
  return entries
    .filter(entry => !entry.isDirectory)
    .map(entry => relativeZipName(entry.entryName))
    .filter(name => /(^|\/)screenshots\/final-[^/]+\.(png|jpe?g|webp)$/i.test(name))
    .sort()
    .map(name => `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${sha}/${name.split('/').map(encodeURIComponent).join('/')}`)
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

export async function materializePublicProject({ owner, repo, sha, baseHost, gamesDir, store, requestFetch = fetch }) {
  validateSource(owner, repo, sha)
  const sourceKey = `${owner.toLowerCase()}/${repo.toLowerCase()}@${sha.toLowerCase()}`
  const existing = await store.bySourceKey(sourceKey)
  if (existing) return existing

  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const [repository, commit] = await Promise.all([
    githubPublic(base, requestFetch),
    githubPublic(`${base}/commits/${sha}`, requestFetch)
  ])
  if (repository.private) throw Object.assign(new Error('Only public repositories are supported'), { status: 404 })
  if (String(commit.sha).toLowerCase() !== sha.toLowerCase()) throw Object.assign(new Error('Commit SHA did not resolve exactly'), { status: 404 })

  const archiveResponse = await requestFetch(`${API}${base}/zipball/${sha}`, { headers: apiHeaders() })
  if (!archiveResponse.ok) throw Object.assign(new Error(`GitHub archive returned ${archiveResponse.status}`), { status: archiveResponse.status })
  const declaredBytes = Number(archiveResponse.headers?.get?.('content-length') || 0)
  if (declaredBytes > MAX_ARCHIVE_BYTES) throw Object.assign(new Error('Repository archive is too large'), { status: 413 })
  const archive = Buffer.from(await archiveResponse.arrayBuffer())
  if (archive.length > MAX_ARCHIVE_BYTES) throw Object.assign(new Error('Repository archive is too large'), { status: 413 })

  const zip = new AdmZip(archive)
  const entries = zip.getEntries()
  const slug = projectSlug(owner, repo, sha)
  const destination = resolve(gamesDir, slug)
  if (!destination.startsWith(`${resolve(gamesDir)}${sep}`)) throw new Error('Unsafe project destination')
  const extracted = extractDeployment(zip, destination)
  try {
    const metadata = pageMetadata(resolve(extracted.staging, 'index.html'))
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
      screenshots: screenshotUrls(entries, owner, repo, sha),
      status: 'published',
      url: `https://${slug}.${baseHost}`,
      install_url: `https://${slug}.${baseHost}/install`,
      store_path: `/${owner}/${repo}/tree/${sha.toLowerCase()}`,
      github_url: `https://github.com/${owner}/${repo}/tree/${sha}`,
      published_at: new Date().toISOString(),
      local_dir: destination
    }
    rmSync(destination, { recursive: true, force: true })
    await import('node:fs/promises').then(fs => fs.rename(extracted.staging, destination))
    await store.put(project)
    return project
  } catch (error) {
    rmSync(extracted.staging, { recursive: true, force: true })
    throw error
  }
}
