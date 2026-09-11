import assert from 'node:assert/strict'
import test from 'node:test'
import { workflowProgress } from '../lib/github-progress.mjs'

test('returns every GitHub Actions step for the issue run', async () => {
  const calls = []
  const requestGithub = async path => {
    calls.push(path)
    if (path.includes('/actions/runs?')) return {
      workflow_runs: [
        { id: 22, display_title: 'OpenCode #8 — build', status: 'in_progress', conclusion: null, html_url: 'https://github.test/run/22', created_at: '2026-09-11T09:00:01Z', updated_at: '2026-09-11T09:01:00Z' },
        { id: 11, display_title: 'OpenCode #7 — other', status: 'completed', conclusion: 'success', html_url: 'https://github.test/run/11', created_at: '2026-09-11T08:00:00Z' }
      ]
    }
    return { jobs: [
      { id: 31, name: 'prepare / prepare', status: 'completed', conclusion: 'success', html_url: 'https://github.test/job/31', steps: [
        { number: 1, name: 'Validate request', status: 'completed', conclusion: 'success' }
      ] },
      { id: 32, name: 'opencode / opencode', status: 'in_progress', conclusion: null, html_url: 'https://github.test/job/32', steps: [
        { number: 1, name: 'Set up job', status: 'completed', conclusion: 'success' },
        { number: 2, name: 'Run OpenCode', status: 'in_progress', conclusion: null },
        { number: 3, name: 'Verify app', status: 'pending', conclusion: null }
      ] }
    ] }
  }

  const result = await workflowProgress({ owner: 'user', repo: 'project', issueNumber: 8, issueCreatedAt: '2026-09-11T09:00:00Z', requestGithub })

  assert.equal(result.run_id, 22)
  assert.equal(result.status, 'in_progress')
  assert.equal(result.active_step, 'Run OpenCode')
  assert.deepEqual(result.jobs.map(job => job.steps.map(step => step.name)), [['Validate request'], ['Set up job', 'Run OpenCode', 'Verify app']])
  assert.match(calls[0], /event=issues/)
  assert.match(calls[1], /actions\/runs\/22\/jobs/)
})

test('reports the exact failed step and keeps its GitHub link', async () => {
  const requestGithub = async path => path.includes('/actions/runs?')
    ? { workflow_runs: [{ id: 22, display_title: 'OpenCode #8 — build', status: 'completed', conclusion: 'failure', html_url: 'https://github.test/run/22', created_at: '2026-09-11T09:00:01Z' }] }
    : { jobs: [{ id: 32, name: 'opencode / opencode', status: 'completed', conclusion: 'failure', html_url: 'https://github.test/job/32', steps: [
      { number: 1, name: 'Run OpenCode', status: 'completed', conclusion: 'failure' },
      { number: 2, name: 'Clean up', status: 'completed', conclusion: 'success' }
    ] }] }

  const result = await workflowProgress({ owner: 'user', repo: 'project', issueNumber: 8, issueCreatedAt: '2026-09-11T09:00:00Z', requestGithub })

  assert.equal(result.status, 'failure')
  assert.equal(result.failed_step, 'Run OpenCode')
  assert.equal(result.jobs[0].url, 'https://github.test/job/32')
})

test('returns a waiting state before the issue workflow run exists', async () => {
  const result = await workflowProgress({ owner: 'user', repo: 'project', issueNumber: 8, issueCreatedAt: '2026-09-11T09:00:00Z', requestGithub: async () => ({ workflow_runs: [] }) })
  assert.deepEqual(result, { status: 'waiting', jobs: [] })
})
