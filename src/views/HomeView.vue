<template>
  <main>
    <section class="hero pixel-field">
      <div class="hero-inner">
        <p class="eyebrow">OPEN SOURCE AI PROJECT STUDIO</p>
        <h1>Create projects with AI</h1>
        <p class="hero-sub">Describe your project. Watch OpenCode build it live. Publish it to the web.</p>
        <GenerationComposer ref="composer" :me="me" />
        <div class="capabilities">
          <div><b>◎</b><span><strong>Publish</strong><small>Permanent web link</small></span></div>
          <div><b>◈</b><span><strong>Live build</strong><small>Watch OpenCode work</small></span></div>
          <div><b>▣</b><span><strong>Install</strong><small>Ready as a web app</small></span></div>
          <div><b>&lt;/&gt;</b><span><strong>GitHub native</strong><small>Issues and immutable commits</small></span></div>
        </div>
      </div>
    </section>
    <section id="discover" class="library">
      <div class="section-heading"><div><p class="eyebrow orange">BUILT IN PUBLIC</p><h2>Projects created by other users</h2></div><label class="library-sort" for="discover-sort"><span>Sort by</span><select id="discover-sort" v-model="sortMode"><option value="latest">Latest</option><option value="stars">GitHub stars</option></select></label></div>
      <div class="catalog-filters">
        <label>Tag<select v-model="tagFilter"><option value="">All tags</option><option v-for="tag in tags" :key="tag" :value="tag">{{ tag }}</option></select></label>
        <label>Rating<select v-model="ratingFilter"><option value="">Any rating</option><option value="8">★★★★☆ and up</option><option value="6">★★★☆☆ and up</option><option value="4">★★☆☆☆ and up</option></select></label>
        <button v-if="tagFilter || ratingFilter" type="button" @click="tagFilter = ''; ratingFilter = ''">Clear filters</button>
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
