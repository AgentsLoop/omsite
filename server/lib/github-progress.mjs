const failedConclusions = new Set(['action_required', 'cancelled', 'failure', 'startup_failure', 'timed_out'])

function issueRun(run, issueNumber, issueCreatedAt) {
  const title = String(run.display_title || run.name || '')
  const matchesNumber = new RegExp(`#${String(issueNumber)}(?:\\D|$)`).test(title)
  const afterIssue = !issueCreatedAt || !run.created_at || Date.parse(run.created_at) >= Date.parse(issueCreatedAt) - 60000
  return matchesNumber && afterIssue
}

function safeStep(step) {
  return {
    number: step.number,
    name: String(step.name || ''),
    status: String(step.status || 'pending'),
    conclusion: step.conclusion || null,
    started_at: step.started_at || null,
    completed_at: step.completed_at || null
  }
}

export async function workflowProgress({ owner, repo, issueNumber, issueCreatedAt, requestGithub }) {
  const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const runs = await requestGithub(`${root}/actions/runs?event=issues&per_page=50`)
  const run = (runs.workflow_runs || []).find(candidate => issueRun(candidate, issueNumber, issueCreatedAt))
  if (!run) return { status: 'waiting', jobs: [] }

  const jobData = await requestGithub(`${root}/actions/runs/${run.id}/jobs?per_page=100`)
  const jobs = (jobData.jobs || []).map(job => ({
    id: job.id,
    name: String(job.name || ''),
    status: String(job.status || 'pending'),
    conclusion: job.conclusion || null,
    url: job.html_url || run.html_url || '',
    started_at: job.started_at || null,
    completed_at: job.completed_at || null,
    steps: (job.steps || []).map(safeStep)
  }))
  const steps = jobs.flatMap(job => job.steps)
  const failed = steps.find(step => failedConclusions.has(step.conclusion))
  const active = steps.find(step => step.status === 'in_progress')
  const conclusion = run.conclusion || null
  return {
    run_id: run.id,
    url: run.html_url || '',
    status: failedConclusions.has(conclusion) ? conclusion : String(run.status || 'waiting'),
    conclusion,
    active_step: active?.name || '',
    failed_step: failed?.name || '',
    created_at: run.created_at || null,
    updated_at: run.updated_at || null,
    jobs
  }
}
