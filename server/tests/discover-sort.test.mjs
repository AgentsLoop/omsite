import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultDiscoverSort, loadDiscoverSort, saveDiscoverSort } from '../../src/lib/discover-sort.mjs'

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }
}

test('uses GitHub stars as the default Discover sort', () => {
  assert.equal(defaultDiscoverSort, 'stars')
  assert.equal(loadDiscoverSort(createStorage()), 'stars')
})

test('restores and saves the selected Discover sort', () => {
  const storage = createStorage({ 'omgithub.discover-sort': 'latest' })

  assert.equal(loadDiscoverSort(storage), 'latest')
  saveDiscoverSort(storage, 'stars')

  assert.equal(loadDiscoverSort(storage), 'stars')
})

test('uses the star default when stored Discover sort is invalid', () => {
  assert.equal(loadDiscoverSort(createStorage({ 'omgithub.discover-sort': 'unexpected' })), 'stars')
})
