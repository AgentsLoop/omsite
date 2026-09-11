export const defaultDiscoverSort = 'stars'

const storageKey = 'omgithub.discover-sort'
const allowedSorts = new Set(['latest', 'stars'])

export function loadDiscoverSort(storage) {
  try {
    const value = storage?.getItem(storageKey)
    return allowedSorts.has(value) ? value : defaultDiscoverSort
  } catch {
    return defaultDiscoverSort
  }
}

export function saveDiscoverSort(storage, value) {
  if (!allowedSorts.has(value)) return
  try {
    storage?.setItem(storageKey, value)
  } catch { /* Storage can be unavailable in privacy-restricted browsers. */ }
}
