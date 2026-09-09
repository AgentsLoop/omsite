import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url')
export function sign(value, secret) { const body = enc(value); return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}` }
export function verify(value, secret) {
  try {
    const parts = value.split('.')
    if (parts.length !== 2) return null
    const [body, mac] = parts
    const expected = createHmac('sha256', secret).update(body).digest('base64url')
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
    return JSON.parse(Buffer.from(body, 'base64url'))
  } catch { return null }
}
export const nonce = () => randomBytes(18).toString('base64url')
export function cookies(header = '') {
  const result = Object.create(null)
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 1) continue
    try {
      const name = decodeURIComponent(part.slice(0, separator).trim())
      if (!Object.hasOwn(result, name)) result[name] = decodeURIComponent(part.slice(separator + 1).trim())
    } catch { /* Ignore malformed cookies without breaking the request. */ }
  }
  return result
}
