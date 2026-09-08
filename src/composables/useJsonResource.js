import { ref, watch } from 'vue'

export function useJsonResource(source, { pollMs = 0, acceptStatuses = [], shouldPoll = () => true } = {}) {
  const data = ref(null), error = ref(''), loading = ref(true)
  watch(source, (url, _previous, onCleanup) => {
    const controller = new AbortController()
    let active = true, timer
    data.value = null; error.value = ''; loading.value = true
    onCleanup(() => { active = false; clearTimeout(timer); controller.abort() })
    async function load() {
      try {
        const response = await fetch(url, { signal: controller.signal })
        const result = await response.json()
        if (!response.ok && !acceptStatuses.includes(response.status)) throw new Error(result.error || `Request failed (${response.status})`)
        if (active) { data.value = result; error.value = '' }
      } catch (failure) {
        if (active) error.value = failure.message
      } finally {
        if (active) {
          loading.value = false
          if (pollMs && shouldPoll(data.value)) timer = setTimeout(load, pollMs)
        }
      }
    }
    load()
  }, { immediate: true })
  return { data, error, loading }
}
