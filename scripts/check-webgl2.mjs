import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const chrome = String(process.env.OMGHITHUB_CHROME_BIN || '')
if (!chrome) throw new Error('OMGHITHUB_CHROME_BIN is required for the WebGL2 preflight.')

const page = `<!doctype html><meta charset="utf-8"><body><script>
const canvas = document.createElement('canvas')
const gl = canvas.getContext('webgl2', { premultipliedAlpha: false })
let renderer = ''
if (gl) {
  const extension = gl.getExtension('WEBGL_debug_renderer_info')
  renderer = extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
}
const status = gl ? 'ok' : 'failed'
document.body.textContent = 'OMGHITHUB_WEBGL2_' + status.toUpperCase() + ' ' + renderer
fetch('/result?status=' + status + '&renderer=' + encodeURIComponent(renderer), { keepalive: true })
</script></body>`

let resolveResult
const received = new Promise(resolve => { resolveResult = resolve })
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  if (url.pathname === '/result') {
    const result = { status: url.searchParams.get('status') || 'failed', renderer: url.searchParams.get('renderer') || '' }
    response.writeHead(204)
    response.end()
    resolveResult(result)
    return
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  response.end(page)
})

const profile = await mkdtemp(join(tmpdir(), 'omgithub-webgl2-'))
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  const child = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', `--user-data-dir=${profile}`,
    '--window-size=1,1', `--screenshot=${join(profile, 'preflight.png')}`, `http://127.0.0.1:${port}/`
  ], { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  const stopped = new Promise(resolve => child.once('close', code => resolve({ status: 'browser-exited', code })))
  let timeoutId
  const timedOut = new Promise(resolve => { timeoutId = setTimeout(() => resolve({ status: 'timed-out' }), 30_000) })
  const result = await Promise.race([received, stopped, timedOut])
  clearTimeout(timeoutId)
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL')
    else child.kill('SIGKILL')
  } catch {}
  if (result.status !== 'ok') {
    throw new Error(`WebGL2 preflight failed: ${result.status}. ${stderr.slice(-2000)}`)
  }
  console.log(`OMGHITHUB_WEBGL2_OK ${result.renderer}`)
} finally {
  await new Promise(resolve => server.close(resolve))
  await rm(profile, { recursive: true, force: true })
}
