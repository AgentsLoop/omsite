<template>
  <div ref="container" class="generation-composer">
    <form class="prompt-box" :aria-busy="busy" @submit.prevent="create">
      <textarea ref="field" v-model="prompt" :disabled="busy" rows="3" placeholder="What should we build next?" aria-label="Generation request" @keydown.enter.exact.prevent="create"></textarea>
      <div class="composer-toolbar">
        <label class="composer-repository"><span aria-hidden="true">⌘</span><span class="sr-only">Repository</span>
          <select ref="repositorySelect" :value="selected" :title="targetCopy" :disabled="busy || creatingProject" @change="changeRepository">
            <option value="">Playground</option>
            <option value="__new_project__" :disabled="!me">New Project…</option>
            <option v-for="repository in options" :key="repository.full_name" :value="repository.full_name">{{ repository.full_name }}</option>
          </select>
        </label>
        <button :disabled="busy || !prompt.trim()" aria-label="Generate"><span v-if="busy" class="spinner"></span><span v-else>↑</span></button>
      </div>
    </form>
    <p v-if="signingIn" class="composer-status" role="status">{{ signInStatus }}</p>
    <p v-if="error || optionsError" class="form-error" role="alert">{{ error || optionsError }}</p>
    <a v-if="!me" href="/auth/github">Sign in to generate</a>
    <dialog ref="projectDialog" class="new-project-dialog" :aria-labelledby="`${dialogId}-title`" @cancel.prevent="cancelProject" @keydown.tab="keepModalFocus">
      <form @submit.prevent="createProject">
        <h2 :id="`${dialogId}-title`">New Project</h2>
        <p>Create a public repository in {{ me?.login }}’s GitHub account.</p>
        <label :for="`${dialogId}-name`">Repository name</label>
        <input :id="`${dialogId}-name`" ref="projectNameField" v-model="projectName" :disabled="creatingProject" required maxlength="100" pattern="[A-Za-z0-9_.\-]+" autocomplete="off" autofocus />
        <p v-if="projectError" class="form-error" role="alert">{{ projectError }}</p>
        <div class="new-project-actions">
          <button type="button" :disabled="creatingProject" @click="cancelProject">Cancel</button>
          <button type="submit" :disabled="creatingProject || !projectName.trim()">{{ creatingProject ? 'Creating…' : 'Create' }}</button>
        </div>
      </form>
    </dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, useId } from 'vue'
import { useRouter } from 'vue-router'
import { useJsonResource } from '../composables/useJsonResource'
const props = defineProps({ me: Object })
const router = useRouter()
const prompt = ref(''), selected = ref(''), additions = ref([]), busy = ref(false), error = ref('')
const draftKey = 'omgithub.generation-draft'
const signingIn = ref(false), signInStatus = ref('')
let signInTimer
try {
  const draft = JSON.parse(window.sessionStorage.getItem(draftKey) || 'null')
  if (typeof draft?.prompt === 'string') {
    prompt.value = draft.prompt
    selected.value = typeof draft.repository === 'string' ? draft.repository : ''
    if (selected.value) additions.value = [{ full_name: selected.value }]
  }
} catch { /* Keep the composer usable when storage is unavailable. */ }
onBeforeUnmount(() => clearTimeout(signInTimer))
const field = ref(null), container = ref(null)
const repositorySelect = ref(null), projectDialog = ref(null), projectNameField = ref(null)
const projectName = ref(''), projectError = ref(''), creatingProject = ref(false), dialogId = useId()
const { data, error: optionsError } = useJsonResource(() => `/api/repositories?viewer=${encodeURIComponent(props.me?.login || '')}`)
const options = computed(() => {
  const rows = [...additions.value, ...(data.value?.repositories || [])]
  return rows.filter((row, index) => rows.findIndex(item => item.full_name.toLowerCase() === row.full_name.toLowerCase()) === index)
})
const targetCopy = computed(() => !selected.value ? (props.me ? `Generate in ${props.me.login}/PlayGround. Create it automatically if needed.` : 'Sign in to generate in your PlayGround repository.') :
  options.value.find(row => row.full_name === selected.value)?.can_write ? `Generate in ${selected.value}.` : 'Copy this public repository to your account, then generate there.')
async function selectRepository(repository) {
  if (busy.value || creatingProject.value) return
  const known = data.value?.repositories?.find(row => row.full_name.toLowerCase() === repository.full_name.toLowerCase())
  if (known) repository = { ...repository, ...known }
  additions.value = [repository, ...additions.value.filter(row => row.full_name.toLowerCase() !== repository.full_name.toLowerCase())]
  selected.value = repository.full_name
  error.value = ''
  await nextTick()
  container.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  field.value?.focus({ preventScroll: true })
}
defineExpose({ selectRepository })
async function changeRepository(event) {
  const value = event.target.value
  if (value !== '__new_project__') { selected.value = value; return }
  event.target.value = selected.value
  if (!props.me) return
  projectName.value = ''; projectError.value = ''
  projectDialog.value.showModal()
  await nextTick()
  projectNameField.value?.focus()
}
function cancelProject() {
  if (creatingProject.value) return
  projectDialog.value.close()
  repositorySelect.value?.focus()
}
function keepModalFocus(event) {
  const controls = [...projectDialog.value.querySelectorAll('input:not(:disabled), button:not(:disabled)')]
  const first = controls[0], last = controls.at(-1)
  if (!first) { event.preventDefault(); return }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
async function createProject() {
  if (creatingProject.value) return
  creatingProject.value = true; projectError.value = ''
  try {
    const response = await fetch('/api/repositories', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: projectName.value.trim() }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not create this repository.')
    creatingProject.value = false
    projectDialog.value.close()
    await selectRepository(result.repository)
  } catch (failure) { projectError.value = failure.message }
  finally { creatingProject.value = false }
}
async function create() {
  if (busy.value || creatingProject.value || projectDialog.value?.open) return
  if (!prompt.value.trim()) return
  if (!props.me) {
    try {
      window.sessionStorage.setItem(draftKey, JSON.stringify({ prompt: prompt.value, repository: selected.value }))
    } catch {
      error.value = 'Could not save your prompt. Enable browser storage and try again.'
      return
    }
    busy.value = true; signingIn.value = true; error.value = ''
    signInStatus.value = 'Preparing your request…'
    signInTimer = setTimeout(() => {
      signInStatus.value = 'Redirecting to GitHub sign-in…'
      signInTimer = setTimeout(() => window.location.assign('/auth/github'), 800)
    }, 2000)
    return
  }
  if (prompt.value.trim().length < 8 || prompt.value.trim().length > 12000) { error.value = 'Prompt must be between 8 and 12,000 characters.'; return }
  busy.value = true; error.value = ''
  try {
    const [owner, repo] = selected.value.split('/')
    const response = await fetch('/api/issues', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: prompt.value, ...(selected.value ? { repository: { owner, repo } } : {}) }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not start generation.')
    try { window.sessionStorage.removeItem(draftKey) } catch { /* Generation already started. */ }
    await router.push(result.omgithub_path)
  } catch (failure) { error.value = failure.message }
  finally { busy.value = false }
}
</script>
