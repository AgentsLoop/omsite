export function githubSubmissionPath(value) {
  let url
  try { url = new URL(value.trim()) } catch { throw new Error('Enter a full GitHub URL, such as https://github.com/owner/game.') }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port) {
    throw new Error('Use a public https://github.com URL.')
  }
  const parts = url.pathname.replace(/\/+$/, '').slice(1).split('/').map(decodeURIComponent)
  const [owner, rawRepo, kind, ref, ...path] = parts
  const repo = rawRepo?.replace(/\.git$/i, '')
  if (!/^[\w-]+$/.test(owner || '') || !/^[\w.-]+$/.test(repo || '') || repo === '.' || repo === '..') {
    throw new Error('Include the repository owner and name in the GitHub URL.')
  }
  if (kind && (!['tree', 'blob'].includes(kind) || !ref)) {
    throw new Error('Use a repository, game folder, or HTML file URL.')
  }
  if (parts.some(part => !part || part === '.' || part === '..' || /[/\\\x00-\x1f]/.test(part))) {
    throw new Error('Use a GitHub URL with a valid path.')
  }
  if (kind === 'blob' && (!path.length || !/\.html?$/i.test(path.at(-1)))) {
    throw new Error('Select an HTML game file or its folder on GitHub.')
  }
  return '/' + [owner, repo, ...(kind ? [kind, ref, ...path] : [])].map(encodeURIComponent).join('/')
}
