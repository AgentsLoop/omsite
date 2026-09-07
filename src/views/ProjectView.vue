<template>
  <main class="studio">
    <div v-if="loading" class="studio-loading"><span class="spinner large"></span><h2>Opening the live build…</h2></div>
    <template v-else-if="project">
      <header class="studio-bar">
        <div class="studio-title"><p class="eyebrow orange">{{ project.status }}</p><h1>{{ cleanTitle }}</h1></div>
        <div class="studio-progress" aria-label="Build progress">
          <div class="progress-numbers"><span v-for="(step, index) in steps" :key="step.label" :class="step.done ? 'done' : step.active ? 'active' : ''">{{ index + 1 }}</span></div>
          <div class="current-progress"><strong>{{ currentStep.label }}</strong><small>{{ currentStep.copy }}</small></div>
        </div>
        <div class="studio-actions"><a :href="project.github_url" target="_blank">View issue ↗</a><RouterLink v-if="project.pr_path" :to="project.pr_path">Store page</RouterLink></div>
      </header>
      <nav class="mobile-pane-tabs" aria-label="Workspace panes"><button :class="mobilePane === 'chat' ? 'active' : ''" @click="mobilePane = 'chat'">Chat</button><button :class="mobilePane === 'preview' ? 'active' : ''" @click="mobilePane = 'preview'">Preview</button></nav>
      <div class="studio-grid">
        <section class="chat-panel" :class="{ 'mobile-hidden': mobilePane !== 'chat' }">
          <div class="preview-toolbar"><span class="live-dot"></span><strong>OpenCode chat</strong><a v-if="project.opencode_url" :href="project.opencode_url" target="_blank">Open ↗</a></div>
          <iframe v-if="project.opencode_url" :src="project.opencode_url" allow="clipboard-read; clipboard-write" title="Live OpenCode chat"></iframe>
          <div v-else class="preview-wait"><div class="orbit"><span></span></div><h2>Preparing OpenCode</h2><p>The live chat appears here as soon as GitHub Actions publishes its secure session.</p></div>
        </section>
        <section class="preview-panel" :class="{ 'mobile-hidden': mobilePane !== 'preview' }">
          <div class="preview-toolbar"><span class="live-dot"></span><strong>{{ previewLabel }}</strong><div v-if="project.screenshots.length" class="shot-tabs"><button v-for="(shot, index) in project.screenshots" :key="shot" :class="displayedShot === shot ? 'selected' : ''" @click="displayedShot = shot">{{ index + 1 }}</button><button v-if="previewUrl" :class="!displayedShot ? 'selected' : ''" @click="displayedShot = ''">Live</button></div><a v-if="displayedShot || previewUrl" :href="displayedShot || previewUrl" target="_blank">Open ↗</a></div>
          <img v-if="displayedShot" class="progress-shot" :src="displayedShot" alt="Latest game progress screenshot" @click="selectedShot = displayedShot" />
          <iframe v-else-if="previewUrl" :src="previewUrl" allow="fullscreen; clipboard-read; clipboard-write" title="Live project preview"></iframe>
          <div v-else class="preview-wait"><div class="orbit"><span></span></div><h2>Waiting for preview</h2><p>Progress screenshots appear here while OpenCode builds. The verified game replaces them when it is ready.</p></div>
        </section>
      </div>
      <div v-if="selectedShot" class="lightbox" @click="selectedShot = ''"><img :src="selectedShot" alt="Screenshot enlarged" /></div>
    </template>
    <div v-else class="error-page"><h1>Project not found</h1><p>{{ error }}</p></div>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
const route = useRoute(), project = ref(null), loading = ref(true), error = ref(''), selectedShot = ref(''), displayedShot = ref(''), mobilePane = ref('chat')
const cleanTitle = computed(() => (project.value?.title || '').replace(/^\/goal\s*/i, ''))
const previewUrl = computed(() => project.value?.published_url || project.value?.preview_url || '')
const previewLabel = computed(() => displayedShot.value ? 'Build screenshot' : project.value?.published_url ? 'Published on Vercel' : project.value?.preview_url ? 'Playable preview' : project.value?.screenshots?.length ? 'Build screenshot' : 'Waiting for preview')
const steps = computed(() => {
  const p = project.value || {}; const complete = p.status === 'complete'
  return [
    { label: 'Issue created', copy: `#${route.params.number} on GitHub`, done: true },
    { label: 'OpenCode building', copy: p.opencode_url ? 'Live session available' : 'Runner is starting', done: Boolean(p.opencode_url), active: !p.opencode_url },
    { label: 'Browser verification', copy: p.preview_url ? 'Public preview verified' : 'Waiting for preview', done: Boolean(p.preview_url), active: Boolean(p.opencode_url && !p.preview_url) },
    { label: 'Published', copy: p.published_url || 'Permanent URL pending', done: Boolean(p.published_url), active: complete && !p.published_url }
  ]
})
const currentStep = computed(() => steps.value.find(step => step.active) || [...steps.value].reverse().find(step => step.done) || steps.value[0])
async function load() { try { const r = await fetch(`/api/github/${route.params.owner}/${route.params.repo}/issues/${route.params.number}`); const data = await r.json(); if (!r.ok) throw new Error(data.error); const previousCount = project.value?.screenshots?.length || 0; project.value = data; if (!previewUrl.value && data.screenshots.length && (!displayedShot.value || data.screenshots.length > previousCount)) displayedShot.value = data.screenshots.at(-1) } catch (e) { error.value = e.message } finally { loading.value = false } }
let timer
onMounted(async () => { await load(); timer = setInterval(load, 8000) }); onBeforeUnmount(() => clearInterval(timer))
</script>
