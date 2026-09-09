import { Router } from 'express'
import { cookies, nonce, sign, verify } from './auth.mjs'

export function createSocialRouter({ store, social, userFor, origin, sessionSecret }) {
  const router = Router()
  const attempts = new Map()
  const fail = (status, message) => Object.assign(new Error(message), { status })
  router.param('id', async (req, res, next, id) => {
    try {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw fail(400, 'Invalid project identifier.')
      req.project = await store.byId(id)
      if (!req.project || req.project.status !== 'published') throw fail(404, 'Game not found.')
      next()
    } catch (error) { next(error) }
  })
  function visitor(req, res) {
    const user = userFor(req)
    if (user) return `user:${user.id}`
    const raw = cookies(req.headers.cookie).omgithub_visitor
    const value = raw && verify(raw, sessionSecret)
    if (value?.id && value.expires > Date.now()) return `visitor:${value.id}`
    const id = nonce()
    res.append('set-cookie', `omgithub_visitor=${encodeURIComponent(sign({ id, expires: Date.now() + 2592000000 }, sessionSecret))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${origin.startsWith('https:') ? '; Secure' : ''}`)
    return `visitor:${id}`
  }
  function mutation(req, res, next) {
    if (req.get('origin') !== origin) return next(fail(403, 'Use the OmGithub site to submit feedback.'))
    req.socialUser = userFor(req)
    if (!req.socialUser) return next(fail(401, 'Sign in with GitHub to submit feedback.'))
    const now = Date.now(), key = String(req.socialUser.id)
    for (const [id, record] of attempts) if (record.until <= now) attempts.delete(id)
    const record = attempts.get(key) || { count: 0, until: now + 60000 }
    if (++record.count > 30) return next(fail(429, 'Please wait before submitting more feedback.'))
    attempts.set(key, record)
    next()
  }
  async function payload(req) {
    return { ...await social.summary(req.project, userFor(req)?.id), comments: await social.comments(req.project) }
  }
  router.get('/:id/social', async (req, res, next) => {
    try { res.set('cache-control', 'no-store').json(await payload(req)) } catch (error) { next(error) }
  })
  router.put('/:id/rating', mutation, async (req, res, next) => {
    try { await social.rate(req.project, req.socialUser, req.body?.rating); res.json(await payload(req)) } catch (error) { next(error) }
  })
  router.put('/:id/comment', mutation, async (req, res, next) => {
    try { await social.comment(req.project, req.socialUser, req.body?.body, req.body?.rating); res.json(await payload(req)) } catch (error) { next(error) }
  })
  router.delete('/:id/comment', mutation, async (req, res, next) => {
    try { await social.deleteComment(req.project, req.socialUser); res.json(await payload(req)) } catch (error) { next(error) }
  })
  router.post('/:id/play', async (req, res, next) => {
    try {
      if (req.get('origin') !== origin) throw fail(403, 'Use the OmGithub site to start a game.')
      await social.play(req.project, visitor(req, res))
      res.set('cache-control', 'no-store').json(await social.summary(req.project))
    } catch (error) { next(error) }
  })
  router.get('/:id/play', async (req, res, next) => {
    try {
      const url = new URL(req.project.url)
      const base = new URL(origin)
      if (!['https:', 'http:'].includes(url.protocol) || !url.hostname.endsWith(`.${base.hostname}`)) throw fail(422, 'Invalid game address.')
      // A document navigation counts a launch; link previews and prefetches do not.
      if (req.get('sec-fetch-mode') === 'navigate' && !req.get('purpose')?.includes('prefetch')) {
        await social.play(req.project, visitor(req, res))
      }
      res.set('cache-control', 'no-store').redirect(302, url.href)
    } catch (error) { next(error) }
  })
  return router
}
