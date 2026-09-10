import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const algorithm = 'aes-256-gcm'

function keyFor(secret) {
  return createHash('sha256').update(secret).digest()
}

function encrypt(value, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv(algorithm, key, iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()])
  return { iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), data: data.toString('base64url') }
}

function decrypt(value, key) {
  const decipher = createDecipheriv(algorithm, key, Buffer.from(value.iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(value.tag, 'base64url'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.data, 'base64url')), decipher.final()]).toString())
}

export function createSessionStore(dataDir, secret, now = Date.now) {
  const file = join(dataDir, 'sessions.enc.json')
  const temporaryFile = `${file}.tmp`
  const key = keyFor(secret)
  mkdirSync(dataDir, { recursive: true })

  let sessions = new Map()
  try {
    const stored = decrypt(JSON.parse(readFileSync(file, 'utf8')), key)
    sessions = new Map(stored.filter(([, session]) => session.expiresAt > now()))
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Cannot read the persistent session store.', { cause: error })
  }

  function save() {
    writeFileSync(temporaryFile, `${JSON.stringify(encrypt([...sessions], key))}\n`, { mode: 0o600 })
    renameSync(temporaryFile, file)
  }

  function prune() {
    let changed = false
    for (const [id, session] of sessions) {
      if (session.expiresAt <= now()) {
        sessions.delete(id)
        changed = true
      }
    }
    return changed
  }

  if (prune()) save()

  return {
    get(id) {
      const session = sessions.get(id)
      if (!session || session.expiresAt > now()) return session
      sessions.delete(id)
      save()
      return undefined
    },
    set(id, session) {
      prune()
      sessions.set(id, session)
      save()
    },
    delete(id) {
      if (sessions.delete(id)) save()
    }
  }
}
