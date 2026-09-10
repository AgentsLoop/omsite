import { createSign } from 'node:crypto'
import { writeFile, rename, rm } from 'node:fs/promises'

const credential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '', 'base64').toString()
const account = JSON.parse(credential)
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({
  iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore',
  aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
})
const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url')
const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + signature }),
  signal: AbortSignal.timeout(30000)
})
if (!tokenResponse.ok) throw new Error('Legacy token request failed: ' + tokenResponse.status)
const { access_token } = await tokenResponse.json()
function decode(value) {
  if ('nullValue' in value) return null
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) {
    const number = Number(value.integerValue)
    if (!Number.isSafeInteger(number)) throw new Error('Unsafe integer in legacy export')
    return number
  }
  if ('doubleValue' in value) return value.doubleValue
  if ('timestampValue' in value) return value.timestampValue
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode)
  if ('mapValue' in value) return fields(value.mapValue.fields || {})
  throw new Error('Unsupported legacy field type: ' + Object.keys(value).join(','))
}
const fields = input => Object.fromEntries(Object.entries(input).map(([key, value]) => [key, decode(value)]))
const out = {}
for (const table of ['omgithub_projects', 'project_social', 'project_ratings', 'project_comments', 'project_plays']) {
  const rows = []
  let pageToken = ''
  do {
    const url = new URL('https://firestore.googleapis.com/v1/projects/' + account.project_id + '/databases/(default)/documents/' + table)
    url.searchParams.set('pageSize', '1000')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const response = await fetch(url, { headers: { authorization: 'Bearer ' + access_token }, signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error('Legacy export ' + table + ': HTTP ' + response.status)
    const page = await response.json()
    rows.push(...(page.documents || []).map(doc => ({ id: doc.name.split('/').at(-1), data: fields(doc.fields || {}) })))
    pageToken = page.nextPageToken || ''
  } while (pageToken)
  out[table] = rows
  console.log(table + ': ' + rows.length)
}
const file = process.argv[2]
if (!file) throw new Error('Supply an output filename')
const temporary = file + '.tmp'
try {
  await writeFile(temporary, JSON.stringify(out), { mode: 0o600, flag: 'wx' })
  await rename(temporary, file)
} finally { await rm(temporary, { force: true }) }
