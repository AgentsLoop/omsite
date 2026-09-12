import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')

test('application shell exposes the redesigned navigation landmarks', async () => {
  const source = await read('../App.vue')
  assert.match(source, /class="site-header"/)
  assert.match(source, /class="brand-symbol"/)
  assert.match(source, /class="header-actions"/)
})

test('home page exposes the editorial hero and catalog hierarchy', async () => {
  const source = await read('../views/HomeView.vue')
  assert.match(source, /class="hero-layout"/)
  assert.match(source, /class="hero-index"/)
  assert.match(source, /class="signal-strip"/)
  assert.match(source, /class="catalog-header"/)
})

test('project cards expose a consistent open affordance', async () => {
  const source = await read('../components/GameCard.vue')
  assert.match(source, /class="card-arrow"/)
  assert.match(source, /Open project/)
})

test('visual system includes responsive, interaction, and reduced-motion rules', async () => {
  const source = await read('../style.css')
  assert.match(source, /--accent:\s*#c7ff4a/)
  assert.match(source, /@media \(hover: hover\) and \(pointer: fine\)/)
  assert.match(source, /@media \(max-width: 720px\)/)
  assert.match(source, /@media \(prefers-reduced-motion: reduce\)/)
  assert.doesNotMatch(source, /transition:\s*all/)
})
