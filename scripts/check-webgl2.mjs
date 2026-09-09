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
document.body.textContent = gl ? 'OMGHITHUB_WEBGL2_OK ' + renderer : 'OMGHITHUB_WEBGL2_FAILED'
</script></body>`

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL')
      else child.kill('SIGKILL')
    }, timeoutMs)
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, timedOut }) })
  })
}

const server = createServer((_request, response) => {
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
  const result = await run(chrome, [
    '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-gpu-vsync', '--disable-frame-rate-limit', `--user-data-dir=${profile}`,
    '--dump-dom', `http://127.0.0.1:${port}/`
  ], 30_000)
  const output = `${result.stdout}\n${result.stderr}`
  const marker = output.match(/OMGHITHUB_WEBGL2_(?:OK|FAILED)[^\n]*/)?.[0] || ''
  if (result.code !== 0 || result.timedOut || !marker.startsWith('OMGHITHUB_WEBGL2_OK ')) {
    throw new Error(`WebGL2 preflight failed${result.timedOut ? ' after 30 seconds' : ''}. ${marker || output.slice(-2000)}`)
  }
  console.log(marker)
} finally {
  await new Promise(resolve => server.close(resolve))
  await rm(profile, { recursive: true, force: true })
}
