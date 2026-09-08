<template>
  <main v-if="project" class="store-page">
    <section class="store-hero">
      <div><p class="eyebrow orange">OMGHITHUB STORE</p><h1>{{ project.title }}</h1><p class="store-description">{{ project.description }}</p><div class="store-buttons"><a class="play" :href="project.play_url" target="_blank">Play</a><a class="install" :href="project.install_url">Install</a><button @click="share">Share</button><RouterLink :to="`/${project.owner}`" class="creator"><img :src="project.owner_avatar" alt="" />By {{ project.owner }}</RouterLink></div><p class="source-note">Published from immutable <a :href="project.github_url" target="_blank">GitHub commit {{ project.commit.slice(0, 12) }}</a></p></div><div class="store-icon">O</div>
    </section>
    <section class="screens-section"><h2>Screenshots</h2><div class="store-shots"><img v-for="shot in project.screenshots" :key="shot" :src="shot" alt="Project screenshot" @click="selected = shot" /></div><p v-if="!project.screenshots.length">No final screenshots were committed under a screenshots directory.</p></section>
    <div v-if="selected" class="lightbox" @click="selected = ''"><img :src="selected" alt="Screenshot enlarged" /></div>
  </main>
  <main v-else-if="publication && publication.state !== 'failed'" class="publication-page">
    <section class="publication-card" aria-live="polite">
      <p class="eyebrow orange">OMGHITHUB DEPLOYMENT</p>
      <h1>Publishing {{ route.params.repo }}</h1>
      <p>{{ publication.message }}</p>
      <ol class="publication-steps">
        <li v-for="step in steps" :key="step.id" :class="{ done: step.index < currentStep, active: step.index === currentStep }"><span>{{ step.index < currentStep ? '✓' : step.index + 1 }}</span>{{ step.label }}</li>
      </ol>
      <p v-if="publication.run_id" class="source-note">GitHub Actions run {{ publication.run_id }} is in progress.</p>
    </section>
  </main>
  <main v-else class="studio-loading"><span v-if="loading" class="spinner large"></span><p v-else>{{ error || publication?.message || 'Project unavailable.' }}</p></main>
</template>
<script setup>
import { computed, ref, watch } from 'vue'; import { useRoute } from 'vue-router'
import { useJsonResource } from '../composables/useJsonResource'
const route = useRoute(), selected = ref('')
const { data: publication, loading, error } = useJsonResource(() => {
  const { owner, repo, sha } = route.params
  const base = `/api/github/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const ref = route.params.ref || sha
  const path = route.params.path ? String(route.params.path).split('/').filter(Boolean).map(encodeURIComponent).join('/') : ''
  return ref ? `${base}/tree/${encodeURIComponent(ref)}${path ? `/${path}` : ''}/progress` : `${base}/progress`
}, { pollMs: 2000, acceptStatuses: [202, 502], shouldPoll: result => result?.state !== 'published' && result?.state !== 'failed' })
const project = computed(() => publication.value?.project || null)
const steps = [
  { index: 0, id: 'checking', label: 'Checking source commit' },
  { index: 1, id: 'queued', label: 'Queueing GitHub Action' },
  { index: 2, id: 'building', label: 'Building game and screenshot' },
  { index: 3, id: 'publishing', label: 'Validating and publishing ZIP' }
]
const currentStep = computed(() => ({ checking: 0, queued: 1, building: 2, publishing: 3, published: 4 }[publication.value?.state] ?? 0))
async function share() { await navigator.clipboard?.writeText(location.href) }
watch(() => route.fullPath, () => { selected.value = '' })
</script>
