<template>
  <main>
    <section class="hero pixel-field">
      <div class="hero-inner">
        <p class="eyebrow">OPEN SOURCE AI GAME STUDIO</p>
        <h1>Create games with AI</h1>
        <p class="hero-sub">Describe the game. Watch OpenCode build it live. Publish it to the web.</p>
        <GenerationComposer :me="me" />
        <div class="capabilities">
          <div><b>◎</b><span><strong>Publish</strong><small>Permanent web link</small></span></div>
          <div><b>◈</b><span><strong>Live build</strong><small>Watch OpenCode work</small></span></div>
          <div><b>▣</b><span><strong>Install</strong><small>Ready as a web app</small></span></div>
          <div><b>&lt;/&gt;</b><span><strong>GitHub native</strong><small>Issues and immutable commits</small></span></div>
        </div>
      </div>
    </section>
    <section id="discover" class="library">
      <div class="section-heading"><div><p class="eyebrow orange">BUILT IN PUBLIC</p><h2>Games created by other users</h2></div><label class="library-sort" for="discover-sort"><span>Sort by</span><select id="discover-sort" v-model="sortMode"><option value="latest">Latest</option><option value="stars">GitHub stars</option></select></label></div>
      <div class="catalog-filters">
        <label>Tag<select v-model="tagFilter"><option value="">All tags</option><option v-for="tag in tags" :key="tag" :value="tag">{{ tag }}</option></select></label>
        <label>Rating<select v-model="ratingFilter"><option value="">Any rating</option><option value="8">★★★★☆ and up</option><option value="6">★★★☆☆ and up</option><option value="4">★★☆☆☆ and up</option></select></label>
        <button v-if="tagFilter || ratingFilter" type="button" @click="tagFilter = ''; ratingFilter = ''">Clear filters</button>
      </div>
      <p v-if="projectsError" class="form-error" role="alert">{{ projectsError }}</p>
      <div v-else-if="loadingProjects" class="cards-grid" aria-label="Loading games"><div v-for="n in 3" :key="n" class="game-card skeleton"></div></div>
      <div v-else-if="projects.length" class="cards-grid"><GameCard v-for="project in projects" :key="project.id || project.issue_path" :project="project" /></div>
      <div v-else class="empty-library">{{ data?.projects?.length ? 'No games match these filters.' : 'Published games will appear here.' }}</div>
    </section>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import GenerationComposer from '../components/GenerationComposer.vue'
import GameCard from '../components/GameCard.vue'
import { useJsonResource } from '../composables/useJsonResource'
defineProps({ me: Object })
const sortMode = ref('latest')
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
