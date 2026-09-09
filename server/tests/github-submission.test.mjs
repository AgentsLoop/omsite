import test from 'node:test'
import assert from 'node:assert/strict'
import { githubSubmissionPath } from '../../src/lib/github-submission.mjs'

test('route public GitHub submissions to the existing anonymous publication flow', () => {
  for (const [url, path] of [
    [' https://github.com/owner/game.git/ ', '/owner/game'],
    ['https://github.com/owner/game/tree/main', '/owner/game/tree/main'],
    ['https://github.com/owner/game/tree/main/games/demo', '/owner/game/tree/main/games/demo'],
    ['https://github.com/owner/game/blob/main/play.html?raw=true#game', '/owner/game/blob/main/play.html']
  ]) assert.equal(githubSubmissionPath(url), path)
})

test('reject unsupported submission links', () => {
  for (const url of ['hello', 'https://example.com/owner/game', 'https://github.com/owner', 'https://github.com/owner/game/issues/1', 'https://github.com/owner/game/tree', 'https://github.com/owner/game/blob/main/app.js', 'https://github.com/owner/game/tree/main/a%2Fb', 'https://user:pass@github.com/owner/game']) {
    assert.throws(() => githubSubmissionPath(url), undefined, url)
  }
})
