<template>
  <main class="profile-page">
    <section v-if="profile" class="profile-hero pixel-field"><img :src="profile.avatar_url" alt="" /><div><p class="eyebrow">OMGHITHUB CREATOR</p><h1>{{ profile.name || profile.login }}</h1><p>@{{ profile.login }} · {{ profile.bio || 'Building in public with AI and GitHub.' }}</p><a :href="profile.html_url" target="_blank">View on GitHub ↗</a></div></section>
    <section class="library profile-library"><div class="section-heading"><div><p class="eyebrow orange">CREATOR LIBRARY</p><h2>Published projects</h2></div><span>{{ projects.length }} projects</span></div><div class="cards-grid"><GameCard v-for="project in projects" :key="project.id" :project="project" /></div><div v-if="!loading && !projects.length" class="empty-library">No published projects yet.</div></section>
  </main>
</template>
<script setup>
import { ref, watch } from 'vue'; import { useRoute } from 'vue-router'; import GameCard from '../components/GameCard.vue'
const route = useRoute(), profile = ref(null), projects = ref([]), loading = ref(true)
watch(() => route.params.login, async login => {
  loading.value = true; profile.value = null; projects.value = []
  try { const r = await fetch(`/api/profiles/${login}`); if (r.ok) { const d = await r.json(); profile.value = d.profile; projects.value = d.projects } } finally { loading.value = false }
}, { immediate: true })
</script>
