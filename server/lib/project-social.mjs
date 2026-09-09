import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const DAY = 24 * 60 * 60 * 1000
const hash = value => createHash('sha256').update(value).digest('hex')
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }) }

function identity(project) {
  if (!project || typeof project !== 'object') fail('A project is required')
  const source = typeof project.source_key === 'string' && project.source_key.match(/^([^/]+)\/([^@]+)@[0-9a-f]{40}(?::(.*))?$/i)
  const owner = project.repo_owner || source?.[1]
  const repo = project.repo || source?.[2]
  if (typeof owner !== 'string' || typeof repo !== 'string' || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) fail('A canonical repository is required')
  // Named and legacy routes both have /owner/repo/tree|blob/ref/selected-path.
  const route = [project.public_path, project.store_path, project.legacy_store_path].find(value => typeof value === 'string' && /^\/[^/]+\/[^/]+\/(tree|blob)\/[^/]+(?:\/|$)/.test(value))
  const routePath = route?.split('/').slice(5).join('/')
  let path = project.project_path ?? routePath ?? source?.[3] ?? ''
  if (typeof path !== 'string' || path.length > 2048 || /[\x00-\x1f]/.test(path)) fail('Invalid selected path')
  path = path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  if (path && path.split('/').some(part => !part || part === '.' || part === '..')) fail('Invalid selected path')
  if (project.source_entry) {
    if (typeof project.source_entry !== 'string' || !/^[^/\\\x00-\x1f]+\.html?$/i.test(project.source_entry)) fail('Invalid source entry')
    if (!path.endsWith(`/${project.source_entry}`) && path !== project.source_entry) path = [path, project.source_entry].filter(Boolean).join('/')
  }
  return hash(JSON.stringify([owner.toLowerCase(), repo.toLowerCase(), path]))
}

function userId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  if (typeof value === 'string' && value.trim() && value.length <= 128 && !/[\x00-\x1f]/.test(value)) return value
  fail('A signed-in user ID is required', 401)
}

function profile(user) {
  const id = userId(user?.id)
  if (typeof user.login !== 'string' || !/^[a-z0-9-]{1,39}$/i.test(user.login)) fail('Invalid user login')
  if (typeof user.avatar_url !== 'string' || user.avatar_url.length > 2048) fail('Invalid avatar URL')
  if (user.avatar_url) {
    let url
    try { url = new URL(user.avatar_url) } catch { fail('Invalid avatar URL') }
    if (url.protocol !== 'https:' || url.username || url.password) fail('Invalid avatar URL')
  }
  return { id, login: user.login, avatar_url: user.avatar_url }
}

function rating(value) {
  if (!Number.isInteger(value) || value < 1 || value > 10) fail('Rating must be an integer from 1 to 10')
  return value
}

function initial(project) {
  return { seed: Number.isInteger(project.complexity_score) && project.complexity_score >= 1 && project.complexity_score <= 10 ? project.complexity_score : null, rating_sum: 0, rating_count: 0, play_count: 0 }
}

function withSeed(state, project) {
  if (state.seed === null && Number.isInteger(project.complexity_score) && project.complexity_score >= 1 && project.complexity_score <= 10) state.seed = project.complexity_score
  return state
}

function publicSummary(state, id, vote) {
  const count = state.rating_count + (state.seed === null ? 0 : 1)
  return { rating: count ? ((state.seed ?? 0) + state.rating_sum) / count : null, rating_count: state.rating_count, play_count: state.play_count, ...(id === undefined ? {} : { my_rating: vote?.value ?? null }) }
}

// Supply trusted server-side project/user records. Derive visitorKey from the
// main-site cookie or authenticated ID (e.g. "anon:..." or "user:...").
// This module hashes keys; it does not authenticate callers or manage cookies.
export function createProjectSocial(dataDir, firestore = null) {
  const file = resolve(dataDir, 'project-social.json')
  const lock = `${file}.lock`
  const summaryCache = new Map()
  const read = async () => {
    try { return JSON.parse(await readFile(file, 'utf8')) } catch (error) {
      if (error.code === 'ENOENT') return { projects: {}, votes: {}, comments: {}, plays: {} }
      throw error
    }
  }
  async function localChange(fn) {
    await mkdir(resolve(dataDir), { recursive: true })
    const deadline = Date.now() + 10000
    for (;;) {
      try { await mkdir(lock); break } catch (error) {
        if (error.code !== 'EEXIST') throw error
        if (Date.now() >= deadline) fail('Social storage is busy; retry later', 503)
        await delay(10)
      }
    }
    const temporary = `${file}.${randomUUID()}.tmp`
    try {
      const db = await read()
      const result = fn(db)
      await writeFile(temporary, JSON.stringify(db), { mode: 0o600, flag: 'wx' })
      await rename(temporary, file)
      return result
    } finally {
      try { await rm(temporary, { force: true }) } finally { await rm(lock, { recursive: true, force: true }) }
    }
  }
  const ref = (collection, key) => firestore.collection(collection).doc(key)

  async function change(project, user, action, input) {
    const pid = identity(project)
    const id = user?.id
    const key = `${pid}_${hash(id ?? input)}`
    function update(state, vote, existingComment, played) {
      const now = Date.now()
      let nextComment = existingComment
      let nextVote = vote
      let nextPlay = played
      if (action === 'rate' || (action === 'comment' && input.rating !== undefined)) {
        const value = action === 'rate' ? input : input.rating
        state.rating_sum += value - (vote?.value ?? 0)
        if (!vote) state.rating_count++
        nextVote = { value }
        if (nextComment) nextComment = { ...nextComment, rating: value }
      }
      if (action === 'comment') nextComment = {
        project_id: pid, user_id: id, login: user.login, avatar_url: user.avatar_url,
        body: input.body, rating: nextVote?.value ?? null,
        created_at: existingComment?.created_at ?? new Date(now).toISOString(),
        updated_at: new Date(now).toISOString(), status: existingComment?.status ?? 'approved'
      }
      if (action === 'delete') nextComment = null
      let counted = false
      if (action === 'play' && (!played || now - played.counted_at >= DAY)) {
        state.play_count++
        nextPlay = { counted_at: now }
        counted = true
      }
      return { state, vote: nextVote, comment: nextComment, play: nextPlay,
        result: { ...publicSummary(state, id, nextVote), ...(action === 'play' ? { counted } : {}) } }
    }
    if (!firestore) {
      const result = await localChange(db => {
      const out = update(withSeed(db.projects[pid] ?? initial(project), project), db.votes[key], db.comments[key], db.plays[key])
      db.projects[pid] = out.state
      if (out.vote) db.votes[key] = out.vote
      if (out.comment) db.comments[key] = out.comment
      else delete db.comments[key]
      if (out.play) db.plays[key] = out.play
      return out.result
      })
      summaryCache.delete(pid)
      return result
    }
    const result = await firestore.runTransaction(async tx => {
      const stateRef = ref('project_social', pid)
      const voteRef = ref('project_ratings', key)
      const commentRef = ref('project_comments', key)
      const playRef = ref('project_plays', key)
      const state = await tx.get(stateRef)
      const refs = action === 'play' ? [playRef] : [voteRef, commentRef]
      const snaps = await Promise.all(refs.map(item => tx.get(item)))
      const out = update(withSeed(state.data() ?? initial(project), project), action === 'play' ? undefined : snaps[0].data(), action === 'play' ? undefined : snaps[1].data(), action === 'play' ? snaps[0].data() : undefined)
      tx.set(stateRef, out.state)
      if (action === 'play') tx.set(playRef, out.play)
      else {
        if (out.vote) tx.set(voteRef, out.vote)
        if (out.comment) tx.set(commentRef, out.comment)
        else if (action === 'delete') tx.delete(commentRef)
      }
      return out.result
    })
    summaryCache.delete(pid)
    return result
  }

  return {
    async summary(project, suppliedId) {
      const pid = identity(project)
      const id = suppliedId === undefined ? undefined : userId(suppliedId)
      const key = id === undefined ? null : `${pid}_${hash(id)}`
      const seed = initial(project).seed
      const cached = id === undefined && summaryCache.get(pid)
      if (cached && cached.seed === seed && cached.expires > Date.now()) return cached.value
      if (!firestore) {
        const db = await read()
        const value = publicSummary(withSeed(db.projects[pid] ?? initial(project), project), id, key && db.votes[key])
        if (id === undefined) summaryCache.set(pid, { value, seed, expires: Date.now() + 30000 })
        return value
      }
      const value = await firestore.runTransaction(async tx => {
        const state = await tx.get(ref('project_social', pid))
        const vote = key ? (await tx.get(ref('project_ratings', key))).data() : undefined
        return publicSummary(withSeed(state.data() ?? initial(project), project), id, vote)
      })
      if (id === undefined) summaryCache.set(pid, { value, seed, expires: Date.now() + 30000 })
      return value
    },
    async comments(project) {
      const pid = identity(project)
      const rows = firestore
        ? (await firestore.collection('project_comments').where('project_id', '==', pid).limit(500).get()).docs.map(doc => doc.data()).filter(row => row.status === 'approved').sort((a, b) => b.created_at.localeCompare(a.created_at) || a.user_id.localeCompare(b.user_id)).slice(0, 100)
        : Object.values((await read()).comments).filter(row => row.project_id === pid && row.status === 'approved').sort((a, b) => b.created_at.localeCompare(a.created_at) || a.user_id.localeCompare(b.user_id)).slice(0, 100)
      return rows.map(({ project_id, user_id, login, avatar_url, body, rating, created_at, updated_at, status }) => ({ id: `${project_id}:${user_id}`, project_id, user_id, login, avatar_url, body, rating, created_at, updated_at, status }))
    },
    async rate(project, user, value) { return change(project, profile(user), 'rate', rating(value)) },
    async comment(project, user, body, value) {
      const author = profile(user)
      if (typeof body !== 'string' || !body.trim() || body.length > 5000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(body)) fail('Comment must contain 1 to 5000 characters of text')
      if (value !== undefined) rating(value)
      return change(project, author, 'comment', { body: body.trim(), rating: value })
    },
    async deleteComment(project, user) { return change(project, profile(user), 'delete') },
    async play(project, visitorKey) {
      if (typeof visitorKey !== 'string' || !visitorKey.trim() || visitorKey.length > 512 || /[\x00-\x1f]/.test(visitorKey)) fail('A visitor key of 1 to 512 characters is required')
      return change(project, null, 'play', visitorKey)
    }
  }
}
