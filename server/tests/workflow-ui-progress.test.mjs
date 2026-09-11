import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeWorkflowProgress } from '../../src/workflow-progress.mjs'

test('counts finished workflow steps and identifies the current action', () => {
  const progress = summarizeWorkflowProgress({
    status: 'in_progress',
    active_step: 'Start OpenCode web UI',
    jobs: [
      { steps: [
        { status: 'completed', conclusion: 'success' },
        { status: 'completed', conclusion: 'success' }
      ] },
      { steps: [
        { status: 'in_progress', conclusion: null },
        { status: 'pending', conclusion: null }
      ] }
    ]
  })

  assert.deepEqual(progress, {
    completed: 2,
    total: 4,
    percent: 50,
    currentAction: 'Start OpenCode web UI'
  })
})

test('uses workflow state when no individual action is active', () => {
  assert.deepEqual(summarizeWorkflowProgress({ status: 'waiting', jobs: [] }), {
    completed: 0,
    total: 0,
    percent: 0,
    currentAction: 'Waiting for GitHub Actions'
  })
})

test('shows the failed action when the workflow stops', () => {
  const progress = summarizeWorkflowProgress({
    status: 'failure',
    failed_step: 'Validate and claim issue request',
    jobs: []
  })

  assert.equal(progress.currentAction, 'Validate and claim issue request')
})
