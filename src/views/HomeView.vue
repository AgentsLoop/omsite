<template>
  <main>
    <section class="hero">
      <div class="hero-grid" aria-hidden="true"></div>
      <div class="hero-layout">
        <div class="hero-copy">
          <div class="hero-index"><span>01</span><span>AI project studio</span></div>
          <p class="eyebrow"><span class="eyebrow-dot"></span> Open source · GitHub native</p>
          <h1>Turn an idea into<br /><em>working software.</em></h1>
          <p class="hero-sub">Describe what you want. OpenCode builds it in public, verifies it in a browser, and gives it a permanent home.</p>
          <a class="hero-jump" href="#discover">Explore what people made <span aria-hidden="true">↓</span></a>
        </div>
        <div class="hero-workbench">
          <div class="workbench-label"><span>Start a build</span><span>⌘ Enter</span></div>
          <GenerationComposer ref="composer" :me="me" />
          <p class="composer-note">No setup. Your prompt becomes a GitHub issue and an immutable build.</p>
        </div>
      </div>
      <div class="signal-strip" aria-label="Platform capabilities">
        <div><span>01</span><strong>Describe</strong><small>Start with plain language</small></div>
        <div><span>02</span><strong>Watch</strong><small>Follow the build live</small></div>
        <div><span>03</span><strong>Verify</strong><small>See browser proof</small></div>
        <div><span>04</span><strong>Publish</strong><small>Share a permanent link</small></div>
      </div>
    </section>
    <section id="discover" class="library">
      <div class="catalog-header">
        <div><p class="eyebrow"><span class="eyebrow-dot"></span> Community index</p><h2>Built in public.</h2><p>Playable experiments, useful tools, and strange ideas made real.</p></div>
        <span class="catalog-count">{{ projects.length.toString().padStart(2, '0') }} / projects</span>
      </div>
      <div class="catalog-controls">
        <div class="catalog-filters">
          <label><span>Category</span><select v-model="tagFilter"><option value="">All projects</option><option v-for="tag in tags" :key="tag" :value="tag">{{ tag }}</option></select></label>
          <label><span>Rating</span><select v-model="ratingFilter"><option value="">Any rating</option><option value="8">4+ stars</option><option value="6">3+ stars</option><option value="4">2+ stars</option></select></label>
          <button v-if="tagFilter || ratingFilter" type="button" @click="tagFilter = ''; ratingFilter = ''">Reset</button>
        </div>
        <label class="library-sort" for="discover-sort"><span>Order</span><select id="discover-sort" v-model="sortMode"><option value="latest">Newest first</option><option value="stars">Most starred</option></select></label>
      </div>
      <p v-if="projectsError" class="form-error" role="alert">{{ projectsError }}</p>
      <div v-else-if="loadingProjects" class="cards-grid" aria-label="Loading projects"><div v-for="n in 3" :key="n" class="game-card skeleton"></div></div>
      <div v-else-if="projects.length" class="cards-grid"><GameCard v-for="project in projects" :key="project.id || project.issue_path" :project="project" @remix="composer?.selectRepository($event)" /></div>
      <div v-else class="empty-library">{{ data?.projects?.length ? 'No projects match these filters.' : 'Published projects will appear here.' }}</div>
    </section>
  </main>
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import GenerationComposer from '../components/GenerationComposer.vue'
import GameCard from '../components/GameCard.vue'
import { useJsonResource } from '../composables/useJsonResource'
import { loadDiscoverSort, saveDiscoverSort } from '../lib/discover-sort.mjs'
defineProps({ me: Object })
const composer = ref(null), route = useRoute()
watch([() => route.query.remix, composer], async ([value, composerInstance]) => {
  if (typeof value !== 'string' || !/^[\w.-]+\/[\w.-]+$/.test(value)) return
  await nextTick()
  const [owner, name] = value.split('/')
  composerInstance?.selectRepository({ owner, name, full_name: value, can_remix: true })
}, { immediate: true, flush: 'post' })
const sortMode = ref(loadDiscoverSort(window.localStorage))
watch(sortMode, value => saveDiscoverSort(window.localStorage, value))
const tagFilter = ref(''), ratingFilter = ref('')
const { data, loading: loadingProjects, error: projectsError } = useJsonResource(() => '/api/projects')
const projectTags = project => (project.tags || []).filter(tag => typeof tag === 'string').map(tag => tag.trim().toLowerCase()).filter(Boolean)
const tags = computed(() => [...new Set((data.value?.projects || []).flatMap(projectTags))].sort())
const projects = computed(() => {
  const rows = (data.value?.projects || []).filter(project => {
    if (tagFilter.value && !projectTags(project).includes(tagFilter.value)) return false
    if (!ratingFilter.value) return true
    const rating = project.rating == null ? NaN : Number(project.rating)
    return Number.isFinite(rating) && rating >= Number(ratingFilter.value)
  })
  const latestFirst = (left, right) => String(right.published_at || '').localeCompare(String(left.published_at || ''))
  if (sortMode.value !== 'stars') return rows.sort(latestFirst)
  return rows.sort((left, right) => {
    const stars = Number(right.github_stars || 0) - Number(left.github_stars || 0)
    return stars || latestFirst(left, right)
  })
})
</script>
