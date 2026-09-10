import { openDatabase } from '../lib/database.mjs'
import { resolve } from 'node:path'
import { createStore } from '../lib/store.mjs'

const dataDir = resolve(process.env.DATA_DIR || './data')
const githubToken = process.env.GITHUB_TOKEN || ''
const database = await openDatabase()

if (!githubToken) throw new Error('GITHUB_TOKEN is required to backfill GitHub stars')

const store = createStore(dataDir, database)
const rows = await store.all()
const pending = rows.filter(row => row.github_stars === null || row.github_stars === undefined)
let updated = 0

for (const row of pending) {
  const owner = row.repo_owner || row.owner_login
  const repo = row.repo
  if (!owner || !repo) continue
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${githubToken}`,
      'user-agent': 'OmGithub',
      'x-github-api-version': '2022-11-28'
    }
  })
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${owner}/${repo}`)
  const repository = await response.json()
  const stars = Number(repository.stargazers_count)
  if (!Number.isFinite(stars)) throw new Error(`GitHub returned no star count for ${owner}/${repo}`)
  await store.put({ ...row, github_stars: stars, github_stars_updated_at: new Date().toISOString() })
  updated += 1
  console.log(`${owner}/${repo}: ${stars}`)
}

console.log(`Backfilled ${updated} of ${pending.length} projects.`)

await database?.close()
