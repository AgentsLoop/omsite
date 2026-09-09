export function parseIssueRequest(issue, defaultBranch = 'main') {
  const body = String(issue?.body || '')
  const title = String(issue?.title || '').trim()
  const directive = title.match(/(?:^|\s)branch:\s*(.*?)\s*$/i)
  const requestTitle = directive ? title.slice(0, directive.index).trim() : title
  if (!directive) return { request: body.trim() || requestTitle, title: requestTitle, targetRef: defaultBranch, branchSpecified: false, branchError: '' }
  const targetRef = directive[1].trim()
  const invalid = !targetRef || targetRef.length > 255 || targetRef === '@' || targetRef.startsWith('-') ||
    targetRef.startsWith('/') || targetRef.endsWith('/') || targetRef.endsWith('.') || targetRef.endsWith('.lock') ||
    targetRef.includes('..') || targetRef.includes('@{') || targetRef.includes('//') ||
    targetRef.split('/').some(part => part.startsWith('.')) || /[\u0000-\u0020\u007f~^:?*[\]\\]/.test(targetRef)
  return {
    request: body.trim() || requestTitle,
    title: requestTitle,
    targetRef: invalid ? defaultBranch : targetRef,
    branchSpecified: true,
    branchError: invalid ? 'Invalid branch directive. End the issue title with `branch: <existing-branch>`.' : ''
  }
}
