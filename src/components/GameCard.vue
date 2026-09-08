<template>
  <RouterLink :to="project.store_path || project.issue_path || '/'" class="game-card">
    <div class="game-card-art" :style="project.screenshot ? { backgroundImage: `url(${project.screenshot})` } : {}">
      <div v-if="!project.screenshot" class="art-placeholder"><span>O</span></div>
      <span class="status-chip">{{ project.status || 'Published' }}</span>
      <span v-if="project.github_stars !== null && project.github_stars !== undefined" class="stars-chip">★ {{ formatStars(project.github_stars) }}</span>
    </div>
    <div class="game-card-copy"><h3>{{ project.title }}</h3><p>{{ project.description || 'Created with OmGithub' }}</p></div>
  </RouterLink>
</template>
<script setup>
defineProps({ project: { type: Object, required: true } })
function formatStars(value) {
  const stars = Number(value || 0)
  return stars >= 1000 ? `${(stars / 1000).toFixed(stars >= 10000 ? 0 : 1)}k` : String(stars)
}
</script>
