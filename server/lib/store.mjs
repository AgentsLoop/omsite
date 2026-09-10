import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export function createStore(dataDir, database = null) {
  mkdirSync(dataDir, { recursive: true })
  const file = join(dataDir, 'projects.json')
  const read = () => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
  const write = (rows) => {
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, JSON.stringify(rows, null, 2))
      renameSync(temporary, file)
    } finally { rmSync(temporary, { force: true }) }
  }
  return {
    async byId(id) {
      if (!database) return read().find(row => row.id === id) || null
      return database.get('omgithub_projects', id)
    },
    async all() {
      if (!database) return read()
      return database.list('omgithub_projects', { order: 'published_at' })
    },
    async bySlug(slug) {
      if (!database) return read().find(row => row.slug === slug) || null
      return (await database.list('omgithub_projects', { field: 'slug', value: slug, limit: 1 }))[0] || null
    },
    async bySourceKey(sourceKey) {
      if (!database) return read().find(row => row.source_key === sourceKey) || null
      return (await database.list('omgithub_projects', { field: 'source_key', value: sourceKey, limit: 1 }))[0] || null
    },
    async byPublicPath(publicPath) {
      if (!database) return read().find(row => row.public_path === publicPath) || null
      return (await database.list('omgithub_projects', { field: 'public_path', value: publicPath, limit: 1 }))[0] || null
    },
    async byRepositoryPath(owner, repo, projectPath = '', sourceEntry = '') {
      const rows = database ? await this.all() : read()
      const prefix = `${String(owner).toLowerCase()}/${String(repo).toLowerCase()}@`
      return rows
        .filter(row => {
          if (row.status !== 'published' || !row.source_key?.startsWith(prefix)) return false
          const source = row.source_key.slice(prefix.length)
          const sha = source.match(/^[0-9a-f]{40}/i)?.[0]
          if (!sha) return false
          return source === `${sha}${projectPath ? `:${projectPath}` : ''}${sourceEntry ? `:${sourceEntry}` : ''}`
        })
        .sort((left, right) => String(right.published_at || '').localeCompare(String(left.published_at || '')))[0] || null
    },
    async put(project) {
      if (database) { await database.put('omgithub_projects', project.id, project, true); return project }
      const rows = read(), index = rows.findIndex(row => row.id === project.id)
      if (index >= 0) rows[index] = { ...rows[index], ...project }; else rows.unshift(project)
      write(rows); return project
    }
  }
}
