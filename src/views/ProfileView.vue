<template>
  <main class="profile-page">
    <p v-if="error" class="form-error profile-error" role="alert">{{ error }}</p>
    <section v-if="profile" class="profile-hero pixel-field">
      <img :src="profile.avatar_url" alt="" />
      <div>
        <p class="eyebrow">OMGHITHUB CREATOR</p>
        <h1>{{ profile.name || profile.login }}</h1>
        <p>@{{ profile.login }} · {{ profile.bio || 'Building in public with AI and GitHub.' }}</p>
        <a :href="profile.html_url" target="_blank">View on GitHub ↗</a>
      </div>
    </section>

    <section v-if="me" class="profile-composer">
      <p class="eyebrow orange">REMIX WITH OPENCODE</p>
      <h2>Describe your change</h2>
      <p>Write the request, then choose a repository below.</p>
      <div class="prompt-box">
        <span class="prompt-icon">✦</span>
        <textarea ref="promptField" v-model="prompt" :disabled="Boolean(remixing)" rows="1" placeholder="Ask OpenCode to add a new game mode…"></textarea>
        <button type="button" disabled aria-label="Choose a repository below">↓</button>
      </div>
      <p v-if="remixError" class="form-error" role="alert">{{ remixError }}</p>
    </section>

    <section class="library profile-library">
      <div class="section-heading"><div><p class="eyebrow orange">CREATOR LIBRARY</p><h2>Published projects</h2></div><span>{{ projects.length }} projects</span></div>
      <div class="cards-grid"><GameCard v-for="project in projects" :key="project.id" :project="project" /></div>
      <div v-if="!loading && !projects.length" class="empty-library">No published projects yet.</div>
    </section>

    <section class="library repository-library">
      <div class="section-heading">
        <div><p class="eyebrow orange">GITHUB REPOSITORIES</p><h2>Repositories</h2></div>
        <span>{{ repositories.length }} repositories</span>
      </div>
      <div v-if="repositories.length" class="repository-grid">
        <article v-for="repository in repositories" :key="repository.id" class="repository-card">
          <div class="repository-card-top">
            <a :href="repository.html_url" target="_blank">{{ repository.full_name }} ↗</a>
            <span>{{ repository.private ? 'Private' : 'Public' }}</span>
          </div>
          <p>{{ repository.description || 'No description.' }}</p>
          <div class="repository-meta">
            <span v-if="repository.language">{{ repository.language }}</span>
            <span>★ {{ repository.stars }}</span>
            <span v-if="repository.fork">Fork</span>
          </div>
          <button v-if="me" type="button" class="remix-button" :disabled="!repository.can_remix || Boolean(remixing)" @click="remix(repository)">
            <span v-if="remixing === repository.full_name" class="spinner"></span>
            <span v-else>{{ repository.can_remix ? 'Remix' : 'Read only' }}</span>
          </button>
        </article>
      </div>
      <div v-if="!loading && !repositories.length" class="empty-library">No repositories found.</div>
    </section>

  </main>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameCard from '../components/GameCard.vue'
import { useJsonResource } from '../composables/useJsonResource'

defineProps({ me: Object })
const route = useRoute()
const router = useRouter()
const prompt = ref('')
const promptField = ref(null)
const remixing = ref('')
const remixError = ref('')
const { data, loading, error } = useJsonResource(() => `/api/profiles/${encodeURIComponent(route.params.login)}`)
const profile = computed(() => data.value?.profile || null)
const repositories = computed(() => data.value?.repositories || [])
const projects = computed(() => data.value?.projects || [])

async function remix(repository) {
  if (remixing.value) return
  if (prompt.value.trim().length < 8) {
    remixError.value = 'Describe the remix in at least 8 characters.'
    await nextTick()
    promptField.value?.focus()
    return
  }
  remixing.value = repository.full_name
  remixError.value = ''
  try {
    const response = await fetch(`/api/repositories/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/remix`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.value })
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not remix this repository.')
    await router.push(result.omgithub_path)
  } catch (failure) {
    remixError.value = failure.message
    remixing.value = ''
  }
}
</script>
