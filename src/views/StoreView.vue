<template>
  <main v-if="project" class="store-page">
    <section class="store-hero">
      <div><p class="eyebrow orange">OMGHITHUB STORE</p><h1>{{ project.title }}</h1><p class="store-description">{{ project.description }}</p><div class="store-buttons"><a v-if="project.play_url" class="play" :href="project.play_url" target="_blank">Play</a><a v-if="project.install_url" class="install" :href="project.install_url">Install</a><button @click="share">Share</button><RouterLink :to="`/${project.owner}`" class="creator"><img :src="project.owner_avatar" alt="" />By {{ project.owner }}</RouterLink></div><p class="source-note">Published from <a :href="project.github_url" target="_blank">GitHub pull request #{{ project.number }}</a></p></div><div class="store-icon">O</div>
    </section>
    <section class="screens-section"><h2>Screenshots</h2><div class="store-shots"><img v-for="shot in project.screenshots" :key="shot" :src="shot" alt="Game screenshot" @click="selected = shot" /></div><p v-if="!project.screenshots.length">No screenshots were attached to this pull request.</p></section>
    <div v-if="selected" class="lightbox" @click="selected = ''"><img :src="selected" alt="Screenshot enlarged" /></div>
  </main>
  <main v-else class="studio-loading"><span v-if="loading" class="spinner large"></span><p v-else>Project unavailable.</p></main>
</template>
<script setup>
import { ref, watch } from 'vue'; import { useRoute } from 'vue-router'
const route = useRoute(), project = ref(null), selected = ref(''), loading = ref(true)
async function share() { await navigator.clipboard?.writeText(location.href) }
watch(() => [route.params.owner, route.params.repo, route.params.number], async ([owner, repo, number]) => {
  loading.value = true; project.value = null
  try { const r = await fetch(`/api/github/${owner}/${repo}/pull/${number}`); if (r.ok) project.value = await r.json() } finally { loading.value = false }
}, { immediate: true })
</script>
