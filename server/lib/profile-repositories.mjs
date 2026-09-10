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
    can_remix: repository.archived !== true && repository.has_issues !== false && Boolean(
      repository.permissions?.admin || repository.permissions?.maintain || repository.permissions?.push
    )
  }
}

export async function listProfileRepositories(login, viewer, requestGithub) {
  const ownProfile = viewer?.login?.toLowerCase() === login.toLowerCase()
  const token = ownProfile ? viewer.token : ''
  const base = ownProfile
    ? '/user/repos?visibility=all&affiliation=owner&sort=updated&direction=desc&per_page=100'
    : `/users/${encodeURIComponent(login)}/repos?type=owner&sort=updated&direction=desc&per_page=100`
  const repositories = []
  for (let page = 1; page <= 10; page += 1) {
    const rows = await requestGithub(`${base}&page=${page}`, token)
    repositories.push(...rows.map(publicRepository))
    if (rows.length < 100) break
  }
  return repositories
}
