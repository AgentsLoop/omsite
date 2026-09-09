<template>
  <main v-if="project" class="store-page">
    <section class="store-hero">
      <div><p class="eyebrow orange">OMGHITHUB STORE</p><h1>{{ project.title }}</h1><p class="store-description">{{ project.description }}</p><div class="store-buttons"><a class="play" :href="`/api/projects/${encodeURIComponent(project.id)}/play`" target="_blank" rel="noopener">Play</a><a class="install" :href="project.install_url">Install</a><button @click="share">Share</button><RouterLink :to="`/${project.owner}`" class="creator"><img v-if="project.owner_avatar" :src="project.owner_avatar" alt="" />By {{ project.owner }}</RouterLink></div><p role="status">{{ shareStatus }}</p><details class="game-details"><summary>Game details</summary><p><a :href="project.github_url" target="_blank" rel="noopener noreferrer">View the source on GitHub</a></p></details></div><div class="store-icon">O</div>
    </section>
    <ProjectSocial :key="`${route.fullPath}:${project.id}`" :project="project" :me="me" />
    <section class="screens-section"><h2>Screenshots</h2><div class="store-shots"><img v-for="shot in project.screenshots" :key="shot" :src="shot" alt="Project screenshot" @click="selected = shot" /></div><p v-if="!project.screenshots?.length" class="empty-reviews">No screenshots yet.</p></section>
    <div v-if="selected" class="lightbox" @click="selected = ''"><img :src="selected" alt="Screenshot enlarged" /></div>
  </main>
  <main v-else-if="publication && publication.state !== 'failed'" class="publication-page">
    <section class="publication-card" aria-live="polite">
      <p class="eyebrow orange">OMGHITHUB DEPLOYMENT</p>
      <h1>Publishing {{ route.params.repo }}</h1>
      <p>{{ friendlyPublicationMessage }}</p>
      <ol class="publication-steps">
        <li v-for="step in steps" :key="step.id" :class="{ done: step.index < currentStep, active: step.index === currentStep }"><span>{{ step.index < currentStep ? '✓' : step.index + 1 }}</span>{{ step.label }}</li>
      </ol>
    </section>
  </main>
  <main v-else class="studio-loading"><span v-if="loading" class="spinner large"></span><p v-else>{{ error || publication?.message || 'Project unavailable.' }}</p></main>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'; import { useRoute } from 'vue-router'
import ProjectSocial from '../components/ProjectSocial.vue'
import { useJsonResource } from '../composables/useJsonResource'
const route = useRoute(), selected = ref('')
defineProps({ me: Object })
const shareStatus = ref('')
let shareGeneration = 0
const { data: publication, loading, error } = useJsonResource(() => {
  const { owner, repo, sha } = route.params
  const base = `/api/github/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const ref = route.params.ref || sha
  const path = route.params.path ? String(route.params.path).split('/').filter(Boolean).map(encodeURIComponent).join('/') : ''
  const routeKind = route.path.includes('/blob/') ? 'blob' : 'tree'
  return ref ? `${base}/${routeKind}/${encodeURIComponent(ref)}${path ? `/${path}` : ''}/progress` : `${base}/progress`
}, { pollMs: 2000, acceptStatuses: [202, 502], shouldPoll: result => result?.state !== 'published' && result?.state !== 'failed' })
const project = computed(() => publication.value?.project || null)
const steps = [
  { index: 0, id: 'checking', label: 'Checking the game' },
  { index: 1, id: 'queued', label: 'Preparing the build' },
  { index: 2, id: 'building', label: 'Creating the game preview' },
  { index: 3, id: 'publishing', label: 'Publishing the game' }
]
const currentStep = computed(() => ({ checking: 0, queued: 1, building: 2, publishing: 3, published: 4 }[publication.value?.state] ?? 0))
const friendlyPublicationMessage = computed(() => ({
  checking: 'Getting everything ready…',
  queued: 'Your game is next in line.',
  building: 'The game and its preview are being created.',
  publishing: 'Almost ready to play.'
}[publication.value?.state] || 'Getting everything ready…'))
async function share() {
  const current = ++shareGeneration
  try { await navigator.clipboard.writeText(location.href); if (current === shareGeneration) shareStatus.value = 'Link copied.' }
  catch { if (current === shareGeneration) shareStatus.value = 'Could not copy. Copy the link from the address bar.' }
}
watch(() => route.fullPath, () => { selected.value = ''; shareStatus.value = ''; shareGeneration++ }, { flush: 'sync' })
onBeforeUnmount(() => { shareGeneration++ })
</script>
