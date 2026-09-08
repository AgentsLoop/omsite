import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export function createStore(dataDir, firestore = null) {
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
    async all() {
      if (!firestore) return read()
      const snap = await firestore.collection('omgithub_projects').orderBy('published_at', 'desc').limit(200).get()
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    },
    async bySlug(slug) {
      if (!firestore) return read().find(row => row.slug === slug) || null
      const snap = await firestore.collection('omgithub_projects').where('slug', '==', slug).limit(1).get()
      return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
    },
    async bySourceKey(sourceKey) {
      if (!firestore) return read().find(row => row.source_key === sourceKey) || null
      const snap = await firestore.collection('omgithub_projects').where('source_key', '==', sourceKey).limit(1).get()
      return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
    },
    async byPublicPath(publicPath) {
      if (!firestore) return read().find(row => row.public_path === publicPath) || null
      const snap = await firestore.collection('omgithub_projects').where('public_path', '==', publicPath).limit(1).get()
      return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
    },
    async byRepositoryPath(owner, repo, projectPath = '') {
      const rows = firestore ? await this.all() : read()
      const prefix = `${String(owner).toLowerCase()}/${String(repo).toLowerCase()}@`
      return rows
        .filter(row => {
          if (row.status !== 'published' || !row.source_key?.startsWith(prefix)) return false
          const source = row.source_key.slice(prefix.length)
          return projectPath ? source === `${source.match(/^[0-9a-f]{40}/i)?.[0] || ''}:${projectPath}` : /^[0-9a-f]{40}$/i.test(source)
        })
        .sort((left, right) => String(right.published_at || '').localeCompare(String(left.published_at || '')))[0] || null
    },
    async put(project) {
      if (firestore) await firestore.collection('omgithub_projects').doc(project.id).set(project, { merge: true })
      const rows = read(), index = rows.findIndex(row => row.id === project.id)
      if (index >= 0) rows[index] = { ...rows[index], ...project }; else rows.unshift(project)
      write(rows); return project
    }
  }
}
