<template>
  <main class="profile-page">
    <p v-if="error" class="form-error">{{ error }}</p>
    <section v-if="profile" class="profile-hero pixel-field"><img :src="profile.avatar_url" alt="" /><div><p class="eyebrow">OMGHITHUB CREATOR</p><h1>{{ profile.name || profile.login }}</h1><p>@{{ profile.login }} · {{ profile.bio || 'Building in public with AI and GitHub.' }}</p><a :href="profile.html_url" target="_blank">View on GitHub ↗</a></div></section>
    <section class="library profile-library"><div class="section-heading"><div><p class="eyebrow orange">CREATOR LIBRARY</p><h2>Published projects</h2></div><span>{{ projects.length }} projects</span></div><div class="cards-grid"><GameCard v-for="project in projects" :key="project.id" :project="project" /></div><div v-if="!loading && !projects.length" class="empty-library">No published projects yet.</div></section>
  </main>
</template>
<script setup>
import { computed } from 'vue'; import { useRoute } from 'vue-router'; import GameCard from '../components/GameCard.vue'
import { useJsonResource } from '../composables/useJsonResource'
const route = useRoute()
const { data, loading, error } = useJsonResource(() => `/api/profiles/${encodeURIComponent(route.params.login)}`)
const profile = computed(() => data.value?.profile || null)
const projects = computed(() => data.value?.projects || [])
</script>
