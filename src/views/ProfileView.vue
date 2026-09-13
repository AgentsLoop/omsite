<template>
  <main class="profile-page">
    <p v-if="error" class="form-error profile-error" role="alert">{{ error }}</p>
    <section v-if="profile" class="profile-hero pixel-field">
      <img :src="profile.avatar_url" alt="" />
      <div>
        <p class="eyebrow">OMGHITHUB CREATOR</p>
        <h1>{{ profile.name || profile.login }}</h1>
        <p>@{{ profile.login }} · {{ profile.bio || 'Building in public with AI and GitHub.' }}</p>
        <div class="profile-links">
          <a :href="profile.html_url" target="_blank">View on GitHub ↗</a>
          <a v-if="isOwnProfile" class="profile-logout" href="/?exec=logout">Log out</a>
        </div>
      </div>
    </section>

    <section class="library profile-library">
      <div class="section-heading"><div><p class="eyebrow orange">CREATOR LIBRARY</p><h2>Published projects</h2></div><span>{{ projects.length }} projects</span></div>
      <div class="cards-grid"><GameCard v-for="project in projects" :key="project.id" :project="project" @remix="remix" /></div>
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
            <span>Public</span>
          </div>
          <p>{{ repository.description || 'No description.' }}</p>
          <div class="repository-meta">
            <span v-if="repository.language">{{ repository.language }}</span>
            <span>★ {{ repository.stars }}</span>
            <span v-if="repository.fork">Fork</span>
          </div>
          <div class="repository-actions">
            <RouterLink v-if="repository.deployment_status === 'published'" :to="repository.deployment_path" class="remix-button">Open</RouterLink>
            <button v-else class="remix-button" :disabled="!repository.can_deploy || Boolean(deploying)" @click="deploy(repository)">{{ deploying === repository.full_name ? 'Deploying…' : 'Deploy' }}</button>
            <button class="remix-button" @click="remix(repository)">Remix</button>
          </div>
        </article>
      </div>
      <p v-if="deployError" class="form-error" role="alert">{{ deployError }}</p>
      <div v-if="!loading && !repositories.length" class="empty-library">No repositories found.</div>
    </section>

  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameCard from '../components/GameCard.vue'
import { useJsonResource } from '../composables/useJsonResource'

const props = defineProps({ me: Object })
const route = useRoute()
const router = useRouter()
const deploying = ref('')
const deployError = ref('')
const { data, loading, error } = useJsonResource(() => `/api/profiles/${encodeURIComponent(route.params.login)}`)
const profile = computed(() => data.value?.profile || null)
const isOwnProfile = computed(() => Boolean(props.me?.login && profile.value?.login?.toLowerCase() === props.me.login.toLowerCase()))
const repositories = computed(() => data.value?.repositories || [])
const projects = computed(() => data.value?.projects || [])

function remix(repository) {
  router.push({ path: '/', query: { remix: repository.full_name } })
}
async function deploy(repository) {
  if (deploying.value) return
  deploying.value = repository.full_name
  deployError.value = ''
  try {
    const response = await fetch(`/api/repositories/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not deploy this repository.')
    await router.push(result.omgithub_path)
  } catch (failure) {
    deployError.value = failure.message
  } finally {
    deploying.value = ''
  }
}
</script>
