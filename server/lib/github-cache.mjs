import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'

export function createGithubCache(dataDir, { requestFetch = fetch, token = '', ttlMs = 86400000 } = {}) {
  const directory = join(dataDir, 'github-cache')
  mkdirSync(directory, { recursive: true })
  const pending = new Map()
  return async function cachedFetch(url, options = {}) {
    const parsed = new URL(url)
    const headers = { ...(options.headers || {}) }
    if (parsed.hostname === 'api.github.com' && token) headers.authorization = `Bearer ${token}`
    const bypassCache = options.cache === false
    const requestOptions = { ...options, headers }
    delete requestOptions.cache
    if (parsed.hostname !== 'api.github.com' || (options.method && options.method !== 'GET') || parsed.pathname.includes('/zipball/') || bypassCache) {
      return requestFetch(url, requestOptions)
    }
    const key = createHash('sha256').update(String(url)).digest('hex')
    const file = join(directory, `${key}.json`)
    let saved
    try { saved = JSON.parse(readFileSync(file, 'utf8')) } catch {}
    const response = record => new Response(record.body, { status: record.status, headers: { 'content-type': 'application/json' } })
    if (saved && Date.now() - saved.time < ttlMs) return response(saved)
    if (!pending.has(key)) pending.set(key, (async () => {
      try {
        const result = await requestFetch(url, { ...options, headers })
        if ((result.status === 429 || result.status === 403 || result.status >= 500) && saved?.status === 200) return saved
        const body = await result.text()
        const record = { body, status: result.status, time: Date.now() }
        // Persist only bounded JSON repository responses; never store credentials.
        if ((result.ok || result.status === 404) && Buffer.byteLength(body) <= 8 * 1024 * 1024) {
          const temporary = `${file}.${randomUUID()}.tmp`
          writeFileSync(temporary, JSON.stringify(record)); renameSync(temporary, file)
        }
        return record
      } catch (error) {
        if (saved?.status === 200) return saved
        throw error
      } finally { pending.delete(key) }
    })())
    return response(await pending.get(key))
  }
}
