import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const componentUrl = new URL('../../src/components/GenerationComposer.vue', import.meta.url)

async function loadComposer({ me, storage = new Map(), fetch = async () => ({ ok: true, json: async () => ({ omgithub_path: '/generated' }) }) } = {}) {
  const component = await readFile(componentUrl, 'utf8')
  const script = component.match(/<script setup>\s*([\s\S]*?)<\/script>/)?.[1]
  assert.ok(script, 'GenerationComposer must have a script setup block')

  const timers = []
  const clearedTimers = []
  const hooks = []
  const redirects = []
  const pushed = []
  const sessionStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null },
    setItem(key, value) { storage.set(key, value) },
    removeItem(key) { storage.delete(key) },
  }
  const context = vm.createContext({
    JSON,
    Promise,
    encodeURIComponent,
    window: { sessionStorage, location: { assign: url => redirects.push(url) } },
    ref: value => ({ value }),
    computed: getter => ({ get value() { return getter() } }),
    nextTick: async () => {},
    onBeforeUnmount: callback => hooks.push(callback),
    useId: () => 'test-id',
    useRouter: () => ({ push: async path => pushed.push(path) }),
    useJsonResource: () => ({ data: { value: { repositories: [] } }, error: { value: '' } }),
    defineProps: () => ({ me }),
    defineExpose: () => {},
    fetch,
    setTimeout: (callback, delay) => {
      const timer = { callback, delay, cleared: false }
      timers.push(timer)
      return timer
    },
    clearTimeout: timer => {
      if (timer) { timer.cleared = true; clearedTimers.push(timer) }
    },
  })
  const runnable = script.replace(/^import .*$/gm, '') + '\nglobalThis.__composer = { create, prompt, selected, additions, busy, error, signingIn, signInStatus, preparationDialog, cancelSignIn }'
  vm.runInContext(runnable, context, { filename: 'GenerationComposer.vue' })

  return {
    composer: context.__composer,
    storage,
    timers,
    clearedTimers,
    hooks,
    redirects,
    pushed,
    runTimer(index) { timers[index].callback() },
  }
}

test('restores a saved generation draft during composer setup', async () => {
  const draft = { prompt: 'Build a keyboard-controlled maze game', repository: 'acme/maze' }
  const app = await loadComposer({ storage: new Map([['omgithub.generation-draft', JSON.stringify(draft)]]) })

  assert.equal(app.composer.prompt.value, draft.prompt)
  assert.equal(app.composer.selected.value, draft.repository)
  assert.equal(JSON.stringify(app.composer.additions.value), JSON.stringify([{ full_name: draft.repository }]))
})

test('saves an unauthenticated draft, prepares it, then redirects once', async () => {
  const app = await loadComposer()
  app.composer.prompt.value = 'Build a keyboard-controlled maze game'
  app.composer.selected.value = 'acme/maze'

  await app.composer.create()
  assert.deepEqual(JSON.parse(app.storage.get('omgithub.generation-draft')), {
    prompt: 'Build a keyboard-controlled maze game', repository: 'acme/maze',
  })
  assert.equal(app.composer.busy.value, true)
  assert.equal(app.composer.signInStatus.value, 'Preparing your request…')
  assert.equal(app.timers.length, 1)
  assert.equal(app.timers[0].delay, 2000)

  // A second Enter while the first request is preparing must not replace the draft or queue another redirect.
  app.composer.prompt.value = 'This must not replace the stored draft'
  await app.composer.create()
  assert.equal(app.timers.length, 1)
  assert.equal(JSON.parse(app.storage.get('omgithub.generation-draft')).prompt, 'Build a keyboard-controlled maze game')

  app.runTimer(0)
  assert.equal(app.composer.signInStatus.value, 'Redirecting to GitHub sign-in…')
  assert.equal(app.timers[1].delay, 800)
  app.runTimer(1)
  assert.deepEqual(app.redirects, ['/auth/github'])
})

test('cleans up the active sign-in timer when the composer unmounts', async () => {
  const preparing = await loadComposer()
  preparing.composer.prompt.value = 'Build a keyboard-controlled maze game'
  await preparing.composer.create()
  preparing.hooks.forEach(callback => callback())
  assert.deepEqual(preparing.clearedTimers, [preparing.timers[0]])

  const redirecting = await loadComposer()
  redirecting.composer.prompt.value = 'Build a keyboard-controlled maze game'
  await redirecting.composer.create()
  redirecting.runTimer(0)
  redirecting.hooks.forEach(callback => callback())
  assert.deepEqual(redirecting.clearedTimers, [redirecting.timers[1]])
})

test('reports storage failures without starting preparation or redirecting', async () => {
  const storage = new Map()
  storage.set = () => { throw new Error('blocked') }
  const app = await loadComposer({ storage })
  app.composer.prompt.value = 'Build a keyboard-controlled maze game'

  await app.composer.create()
  assert.equal(app.composer.error.value, 'Could not save your prompt. Enable browser storage and try again.')
  assert.equal(app.composer.busy.value, false)
  assert.equal(app.timers.length, 0)
  assert.deepEqual(app.redirects, [])
})

test('clears the saved draft only after a signed-in issue is created', async () => {
  const storage = new Map([['omgithub.generation-draft', JSON.stringify({ prompt: 'stale' })]])
  const app = await loadComposer({ me: { login: 'alice' }, storage })
  app.composer.prompt.value = 'Build a keyboard-controlled maze game'
  app.composer.selected.value = 'alice/maze'

  await app.composer.create()
  assert.equal(storage.has('omgithub.generation-draft'), false)
  assert.deepEqual(app.pushed, ['/generated'])
})

test('opens a modal and cancels sign-in without losing the saved prompt', async () => {
  const app = await loadComposer()
  let opened = false
  app.composer.preparationDialog.value = { showModal() { opened = true }, close() { opened = false } }
  app.composer.prompt.value = 'Create a colorful space game'
  await app.composer.create()
  assert.equal(opened, true)
  app.composer.cancelSignIn()
  assert.equal(opened, false)
  assert.equal(app.composer.busy.value, false)
  assert.equal(app.timers[0].cleared, true)
  assert.equal(JSON.parse(app.storage.get('omgithub.generation-draft')).prompt, app.composer.prompt.value)
})

test('renders the preparation dialog without the redundant sign-in link', async () => {
  const component = await readFile(componentUrl, 'utf8')
  assert.ok(component.includes('class="preparation-dialog"'))
  assert.ok(component.includes('@cancel.prevent="cancelSignIn"'))
  assert.ok(!component.includes('>Sign in to generate</a>'))
})
