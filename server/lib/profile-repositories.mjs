export function publicRepository(repository) {
  return {
    id: repository.id,
    name: repository.name,
    full_name: repository.full_name,
    owner: repository.owner?.login || '',
    description: repository.description || '',
    html_url: repository.html_url,
    private: repository.private === true,
    fork: repository.fork === true,
    archived: repository.archived === true,
    language: repository.language || '',
    stars: Number(repository.stargazers_count || 0),
    updated_at: repository.updated_at || '',
    default_branch: repository.default_branch || '',
    has_issues: repository.has_issues !== false,
    can_write: Boolean(
      repository.permissions?.admin || repository.permissions?.maintain || repository.permissions?.push
    ),
    can_remix: repository.private !== true,
    can_deploy: repository.private !== true,
    deployment_status: 'not_deployed',
    deployment_path: ''
  }
}

export async function listProfileRepositories(login, viewer, requestGithub) {
  const ownProfile = viewer?.login?.toLowerCase() === login.toLowerCase()
  const token = ownProfile ? viewer.token : ''
  const base = ownProfile
    ? '/user/repos?visibility=public&affiliation=owner&sort=updated&direction=desc&per_page=100'
    : `/users/${encodeURIComponent(login)}/repos?type=owner&sort=updated&direction=desc&per_page=100`
  const repositories = []
  for (let page = 1; page <= 10; page += 1) {
    const rows = await requestGithub(`${base}&page=${page}`, token)
    repositories.push(...rows.filter(row => row.private !== true).map(publicRepository))
    if (rows.length < 100) break
  }
  return repositories
}

export function withDeployments(repositories, projects) {
  return repositories.map(repository => {
    const prefix = `${repository.full_name.toLowerCase()}@`
    const project = projects.filter(row => row.status === 'published' &&
      row.source_key?.startsWith(prefix) && /^[a-f0-9]{40}$/i.test(row.source_key.slice(prefix.length)))
      .sort((a, b) => String(b.published_at || '').localeCompare(String(a.published_at || '')))[0]
    return { ...repository, deployment_status: project ? 'published' : 'not_deployed',
      deployment_path: project ? (project.public_path || project.store_path || `/${repository.full_name}`) : '' }
  })
}
