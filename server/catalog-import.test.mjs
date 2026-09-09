import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalKey, discoverGames, extractPrompts, normalizeSource, publishCandidate } from './catalog-import-lib.mjs'

test('catalog source identities ignore refs and retain selected HTML files', () => {
  const named = normalizeSource('https://github.com/Owner/Repo/tree/main/games/demo')
  const commit = normalizeSource(`https://github.com/owner/repo/tree/${'a'.repeat(40)}/games/demo`)
  const blob = normalizeSource('https://github.com/owner/repo/blob/main/games/demo/play.html')
  assert.equal(canonicalKey(named), canonicalKey(commit))
  assert.equal(blob.entry, 'play.html')
  assert.notEqual(canonicalKey(named), canonicalKey(blob))
})

test('catalog discovery keeps game directories distinct and imports only explicit prompts', () => {
  const source = { ...normalizeSource('owner/repo'), ref: 'main', kind: 'game' }
  const candidates = discoverGames(source, [
    { type: 'blob', path: 'index.html' },
    { type: 'blob', path: 'games/one/index.html' },
    { type: 'blob', path: 'games/two/play.html' },
    { type: 'blob', path: 'node_modules/bad/index.html' }
  ])
  assert.deepEqual(candidates.map(canonicalKey), ['owner/repo::', 'owner/repo:games/one:', 'owner/repo:games/two:play.html'])
  const prompts = extractPrompts('## Demo\nhttps://github.com/owner/repo/tree/main/games/one\nPrompt:\n```text\nBuild this exact game.\n```', { sourceUrl: 'https://github.com/list/catalog/blob/main/README.md', catalog: true, filename: 'README.md' })
  assert.equal(prompts[0].prompt, 'Build this exact game.')
  assert.equal(canonicalKey(prompts[0].target), 'owner/repo:games/one:')
  assert.deepEqual(extractPrompts('A nice game without a recorded prompt.', { sourceUrl: 'https://github.com/owner/repo/blob/main/README.md', fallback: source, filename: 'README.md' }), [])
})

test('a direct game source is publishable while additional HTML files require review', async () => {
  const source = { url: 'https://github.com/owner/repo', kind: 'game' }
  const github = async url => url.endsWith('/repos/owner/repo')
    ? { default_branch: 'main' }
    : { sha: 'a'.repeat(40), tree: [{ type: 'blob', path: 'tools/debug.html', size: 10 }] }
  const scan = await (await import('./catalog-import-lib.mjs')).scanSource(source, { github })
  assert.equal(scan.candidates[0].review_required, false)
  assert.equal(canonicalKey(scan.candidates[0]), 'owner/repo::')
  assert.equal(scan.candidates[1].review_required, true)
})

test('publication polling returns the final project state without artifacts', async () => {
  const states = [{ state: 'queued' }, { state: 'published', project: { id: 'game' } }]
  const result = await publishCandidate({ ...normalizeSource('owner/repo'), kind: 'game' }, {
    origin: 'https://omgithub.com', pollMs: 0, sleep: async () => {},
    requestFetch: async () => Response.json(states.shift(), { status: states.length ? 202 : 200 })
  })
  assert.equal(result.state, 'published')
  assert.equal(result.project.id, 'game')
})
