<template>
  <div ref="container" class="generation-composer">
    <form class="prompt-box" @submit.prevent="create">
      <span class="prompt-icon">✦</span>
      <textarea ref="field" v-model="prompt" :disabled="busy" rows="1" placeholder="Ask OmGithub to create or change a game…" aria-label="Generation request" @keydown.enter.exact.prevent="create"></textarea>
      <button :disabled="busy || !prompt.trim()" aria-label="Generate"><span v-if="busy" class="spinner"></span><span v-else>↑</span></button>
    </form>
    <label class="composer-repository">Repository
      <select v-model="selected" :disabled="busy">
        <option value="">Playground</option>
        <option v-for="repository in options" :key="repository.full_name" :value="repository.full_name">{{ repository.full_name }}</option>
      </select>
    </label>
    <p class="composer-target">{{ targetCopy }}</p>
    <p v-if="error || optionsError" class="form-error" role="alert">{{ error || optionsError }}</p>
    <a v-if="!me" href="/auth/github">Sign in to generate</a>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useJsonResource } from '../composables/useJsonResource'
const props = defineProps({ me: Object })
const router = useRouter()
const prompt = ref(''), selected = ref(''), extra = ref(null), busy = ref(false), error = ref('')
const field = ref(null), container = ref(null)
const { data, error: optionsError } = useJsonResource(() => `/api/repositories?viewer=${encodeURIComponent(props.me?.login || '')}`)
const options = computed(() => {
  const rows = data.value?.repositories || []
  return extra.value && !rows.some(row => row.full_name === extra.value.full_name) ? [extra.value, ...rows] : rows
})
const targetCopy = computed(() => !selected.value ? 'Generate in AgentsLoop/PlayGround.' :
  options.value.find(row => row.full_name === selected.value)?.can_write ? `Generate in ${selected.value}.` : 'Copy this public repository to your account, then generate there.')
async function selectRepository(repository) {
  if (busy.value) return
  extra.value = repository
  selected.value = repository.full_name
  error.value = ''
  await nextTick()
  container.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  field.value?.focus({ preventScroll: true })
}
defineExpose({ selectRepository })
async function create() {
  if (busy.value) return
  if (prompt.value.trim().length < 8 || prompt.value.trim().length > 12000) { error.value = 'Prompt must be between 8 and 12,000 characters.'; return }
  if (!props.me) { error.value = 'Sign in with GitHub to generate.'; return }
  busy.value = true; error.value = ''
  try {
    const [owner, repo] = selected.value.split('/')
    const response = await fetch('/api/issues', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: prompt.value, ...(selected.value ? { repository: { owner, repo } } : {}) }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not start generation.')
    await router.push(result.omgithub_path)
  } catch (failure) { error.value = failure.message }
  finally { busy.value = false }
}
</script>
