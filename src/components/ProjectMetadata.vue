<template>
  <div class="project-metadata">
    <div v-if="tags.length" class="tag-list"><span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span></div>
    <div class="catalog-stats">
      <span v-if="rating !== null">{{ Number(project.rating_count || 0) === 0 ? 'Initial rating' : 'Rating' }}: {{ rating }} / 10</span>
      <span v-else>Unrated</span>
      <span>{{ Number(project.rating_count || 0).toLocaleString() }} ratings</span>
      <span>{{ Number(project.play_count || 0).toLocaleString() }} plays</span>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ project: { type: Object, required: true } })
const tags = computed(() => [...new Set((props.project.tags || []).filter(tag => typeof tag === 'string').map(tag => tag.trim().toLowerCase()).filter(Boolean))])
const rating = computed(() => props.project.rating != null && Number(props.project.rating) >= 1 && Number(props.project.rating) <= 10 ? Number(props.project.rating).toFixed(1) : null)
</script>
