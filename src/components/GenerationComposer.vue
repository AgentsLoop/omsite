<template>
  <div ref="container" class="generation-composer">
    <form class="prompt-box" @submit.prevent="create">
      <span class="prompt-icon">✦</span>
      <textarea ref="field" v-model="prompt" :disabled="busy" rows="1" placeholder="Ask OmGithub to create or change a game…" aria-label="Generation request" @keydown.enter.exact.prevent="create"></textarea>
      <button :disabled="busy || !prompt.trim()" aria-label="Generate"><span v-if="busy" class="spinner"></span><span v-else>↑</span></button>
    </form>
    <label class="composer-repository">Repository
      <select ref="repositorySelect" :value="selected" :disabled="busy || creatingProject" @change="changeRepository">
        <option value="">Playground</option>
        <option value="__new_project__" :disabled="!me">New Project…</option>
        <option v-for="repository in options" :key="repository.full_name" :value="repository.full_name">{{ repository.full_name }}</option>
      </select>
    </label>
    <p class="composer-target">{{ targetCopy }}</p>
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
import { computed, nextTick, ref, useId } from 'vue'
import { useRouter } from 'vue-router'
import { useJsonResource } from '../composables/useJsonResource'
const props = defineProps({ me: Object })
const router = useRouter()
const prompt = ref(''), selected = ref(''), additions = ref([]), busy = ref(false), error = ref('')
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
