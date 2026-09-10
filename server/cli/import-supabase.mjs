import { readFile } from 'node:fs/promises'
import { openDatabase, tables } from '../lib/database.mjs'

// Import a document export { table: [{ id, data }] } or a local projects array.
const file = process.argv[2]
if (!file) throw new Error('Supply an export file')
const input = JSON.parse(await readFile(file, 'utf8'))
const records = Array.isArray(input) ? { omgithub_projects: input.map(data => ({ id: data.id, data })) } : input
for (const [table, rows] of Object.entries(records)) {
  if (!tables.includes(table) || !Array.isArray(rows)) throw new Error('Unknown export table: ' + table)
  for (const row of rows) {
    if (typeof row.id !== 'string' || !row.id || !row.data || typeof row.data !== 'object') throw new Error('Invalid export record')
  }
}
const db = await openDatabase()
if (!db) throw new Error('SUPABASE_DB_URL is required')
try {
  await db.transaction('omgithub-import', async tx => {
    for (const [table, rows] of Object.entries(records)) {
      for (const { id, data } of rows) {
        if (await tx.get(table, id)) throw new Error('Refuse to overwrite existing record: ' + table + '/' + id)
        await tx.put(table, id, table === 'omgithub_projects' ? { ...data, id } : data)
      }
    }
  })
  for (const [table, rows] of Object.entries(records)) console.log(table + ': imported ' + rows.length)
} finally { await db.close() }
