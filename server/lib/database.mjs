import pg from 'pg'

export const tables = ['omgithub_projects', 'project_social', 'project_ratings', 'project_comments', 'project_plays']
function tableName(table) {
  if (!tables.includes(table)) throw new Error('Unknown database table')
  return `public."${table}"`
}

export function createDatabase(pool) {
  function operations(client) {
    return {
      async get(table, id) {
        const result = await client.query(`SELECT data FROM ${tableName(table)} WHERE id = $1`, [id])
        return result.rows[0]?.data ?? null
      },
      async list(table, { field, value, order, limit } = {}) {
        const params = []
        let sql = `SELECT data FROM ${tableName(table)}`
        if (field) { params.push(field, value); sql += ' WHERE data ->> $1 = $2' }
        if (order) { params.push(order); sql += ` ORDER BY data ->> $${params.length} DESC NULLS LAST, id` }
        else sql += ' ORDER BY id'
        if (limit !== undefined) { params.push(limit); sql += ` LIMIT $${params.length}` }
        return (await client.query(sql, params)).rows.map(row => row.data)
      },
      async put(table, id, data, merge = false) {
        const name = tableName(table)
        await client.query(`INSERT INTO ${name} AS target (id, data) VALUES ($1, $2::jsonb)
          ON CONFLICT (id) DO UPDATE SET data = ${merge ? 'target.data || EXCLUDED.data' : 'EXCLUDED.data'}`, [id, JSON.stringify(data)])
      },
      async delete(table, id) {
        await client.query(`DELETE FROM ${tableName(table)} WHERE id = $1`, [id])
      }
    }
  }
  return {
    ...operations(pool),
    async transaction(key, fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        // Serialize changes to one project, including its first write.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key])
        const result = await fn(operations(client))
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally { client.release() }
    },
    async close() { await pool.end() }
  }
}

export async function openDatabase(env = process.env) {
  if (!env.SUPABASE_DB_URL) {
    if (env.NODE_ENV === 'production') throw new Error('SUPABASE_DB_URL is required in production')
    return null
  }
  const pool = new pg.Pool({ connectionString: env.SUPABASE_DB_URL, max: 10, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000, allowExitOnIdle: true })
  pool.on('error', error => console.error('Supabase database connection failed:', error.message))
  try { await pool.query('SELECT 1 FROM public.omgithub_projects LIMIT 1') }
  catch (error) { await pool.end(); throw error }
  return createDatabase(pool)
}
