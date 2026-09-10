const fail = (message, status = 400) => Object.assign(new Error(message), { status })

export function createTokenSignIn({ github, setSession, clearSession }) {
  return async function tokenSignIn(req, res, next) {
    if (req.method !== 'GET' || req.path !== '/') return next()
    if (req.query.exec === 'logout') {
      res.set('cache-control', 'no-store')
      res.set('referrer-policy', 'no-referrer')
      clearSession?.(req, res)
      return res.redirect(303, '/')
    }
    if (req.query.token === undefined) return next()
    try {
      res.set('cache-control', 'no-store')
      res.set('referrer-policy', 'no-referrer')
      if (typeof req.query.token !== 'string' || req.query.token.length < 20 || req.query.token.length > 255 || /[^\x21-\x7e]/.test(req.query.token)) {
        throw fail('Invalid GitHub token.')
      }
      const profile = await github('/user', req.query.token)
      if (!profile?.id || typeof profile.login !== 'string' || !profile.login) throw fail('GitHub did not return a valid profile.', 401)
      setSession(res, {
        id: profile.id,
        login: profile.login,
        name: profile.name,
        avatar_url: profile.avatar_url,
        html_url: profile.html_url,
        token: req.query.token
      })
      res.redirect(303, `/${encodeURIComponent(profile.login)}`)
    } catch (error) {
      if (error.status === 401 || error.status === 403) return next(fail('GitHub rejected the token.', 401))
      next(error)
    }
  }
}
