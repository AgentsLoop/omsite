const finishedStates = new Set(['success', 'failure', 'cancelled', 'skipped', 'timed_out', 'startup_failure', 'action_required'])

export function summarizeWorkflowProgress(actions = {}) {
  const steps = (actions.jobs || []).flatMap(job => job.steps || [])
  const completed = steps.filter(step => finishedStates.has(step.conclusion || step.status)).length
  const total = steps.length
  const currentAction = actions.failed_step
    || actions.active_step
    || (actions.status === 'waiting' ? 'Waiting for GitHub Actions' : 'Starting GitHub Actions')

  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    currentAction
  }
}
