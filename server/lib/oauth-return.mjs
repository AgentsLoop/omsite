const AUTH_PATHS = new Set(['/auth/github', '/auth/github/callback'])

/**
 * Return a safe site-local URL, or an empty string if value is not one.
 * A return target must be an absolute local path, not an origin-relative URL.
 */
export function validateOAuthReturn(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001F\u007F]/.test(value)) return ''

  let decoded
  try { decoded = decodeURIComponent(value) } catch { return '' }
  if (decoded.includes('\\') || decoded.startsWith('//') || /[\u0000-\u001F\u007F]/.test(decoded)) return ''

  let target
  try { target = new URL(value, 'http://omgithub.local') } catch { return '' }
  const pathname = decodeURIComponent(target.pathname).replace(/\/+$/, '') || '/'
  if (target.origin !== 'http://omgithub.local' || AUTH_PATHS.has(pathname)) return ''
  return `${target.pathname}${target.search}${target.hash}`
}

/** Return a validated local path from a same-origin Referer header. */
export function oauthReturnFromReferer(referer, origin) {
  if (typeof referer !== 'string') return ''
  try {
    const url = new URL(referer)
    if (url.origin !== origin) return ''
    return validateOAuthReturn(`${url.pathname}${url.search}${url.hash}`)
  } catch { return '' }
}
