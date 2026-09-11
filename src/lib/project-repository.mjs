export function projectRepository(project) {
  const owner = project.repo_owner, name = project.repo
  if (!owner || !name) return null
  return { owner, name, full_name: `${owner}/${name}`, can_remix: true }
}

export function projectRemixLocation(project) {
  const repository = projectRepository(project)
  return repository ? { path: '/', query: { remix: repository.full_name } } : null
}
