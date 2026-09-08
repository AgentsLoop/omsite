<template>
  <main v-if="project" class="store-page">
    <section class="store-hero">
      <div><p class="eyebrow orange">OMGHITHUB STORE</p><h1>{{ project.title }}</h1><p class="store-description">{{ project.description }}</p><div class="store-buttons"><a class="play" :href="project.play_url" target="_blank">Play</a><a class="install" :href="project.install_url">Install</a><button @click="share">Share</button><RouterLink :to="`/${project.owner}`" class="creator"><img :src="project.owner_avatar" alt="" />By {{ project.owner }}</RouterLink></div><p class="source-note">Published from immutable <a :href="project.github_url" target="_blank">GitHub commit {{ project.commit.slice(0, 12) }}</a></p></div><div class="store-icon">O</div>
    </section>
    <section class="screens-section"><h2>Screenshots</h2><div class="store-shots"><img v-for="shot in project.screenshots" :key="shot" :src="shot" alt="Project screenshot" @click="selected = shot" /></div><p v-if="!project.screenshots.length">No final screenshots were committed under a screenshots directory.</p></section>
    <div v-if="selected" class="lightbox" @click="selected = ''"><img :src="selected" alt="Screenshot enlarged" /></div>
  </main>
  <main v-else class="studio-loading"><span v-if="loading" class="spinner large"></span><p v-else>{{ error || 'Project unavailable.' }}</p></main>
</template>
<script setup>
import { ref, watch } from 'vue'; import { useRoute } from 'vue-router'
import { useJsonResource } from '../composables/useJsonResource'
const route = useRoute(), selected = ref('')
const { data: project, loading, error } = useJsonResource(() => {
  const { owner, repo, sha } = route.params
  const base = `/api/github/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  return sha ? `${base}/tree/${encodeURIComponent(sha)}` : base
})
async function share() { await navigator.clipboard?.writeText(location.href) }
watch(() => route.fullPath, () => { selected.value = '' })
</script>
