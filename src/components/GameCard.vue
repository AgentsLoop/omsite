<template>
  <article class="game-card">
  <RouterLink :to="project.store_path || project.issue_path || '/'" class="project-card-link">
    <div class="game-card-art" :style="project.screenshot ? { backgroundImage: `url(${project.screenshot})` } : {}">
      <div v-if="!project.screenshot" class="art-placeholder"><span>O</span></div>
      <span class="status-chip">{{ project.status || 'Published' }}</span>
      <span v-if="project.github_stars !== null && project.github_stars !== undefined" class="stars-chip">★ {{ formatStars(project.github_stars) }}</span>
    </div>
    <div class="game-card-copy"><h3>{{ project.title }}</h3><p>{{ project.description || 'Created with OmGithub' }}</p><ProjectMetadata :project="project" compact-view /></div>
  </RouterLink>
  <div v-if="repository" class="project-card-actions"><button class="remix-button" @click="$emit('remix', repository)">Remix</button></div>
  </article>
</template>
<script setup>
import ProjectMetadata from './ProjectMetadata.vue'
import { computed } from 'vue'
import { projectRepository } from '../lib/project-repository.mjs'
const props = defineProps({ project: { type: Object, required: true } })
defineEmits(['remix'])
const repository = computed(() => projectRepository(props.project))
function formatStars(value) {
  const stars = Number(value || 0)
  return stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10000 ? 0 : 1)}k` : String(stars)
}
</script>
