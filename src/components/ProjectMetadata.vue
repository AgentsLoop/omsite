<template>
  <div class="project-metadata">
    <div v-if="tags.length" class="tag-list"><span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span></div>
    <div class="catalog-stats">
      <span class="star-summary" :aria-label="ratingLabel" :title="ratingLabel">
        <span class="star-meter" aria-hidden="true"><span class="star-base">★★★★★</span><span class="star-fill" :style="{ width: ratingWidth }">★★★★★</span></span>
        <span v-if="ratingCount" class="rating-count">({{ compact(ratingCount) }})</span>
      </span>
      <span class="play-stat" :aria-label="playLabel" :title="playLabel"><span aria-hidden="true">▶</span> {{ compact(playCount) }} {{ playCount === 1 ? 'play' : 'plays' }}</span>
    </div>
    <p v-if="compactView && project.graphics_demand" class="graphics-demand" :title="project.graphics_demand.assumptions">Graphics demand: {{ demandLabel(project.graphics_demand.level) }} · OC estimate</p>
    <details v-else-if="project.graphics_demand" class="graphics-demand">
      <summary>Graphics demand: {{ demandLabel(project.graphics_demand.level) }} · OC estimate</summary>
      <p>Estimated GPU requirement for typical active gameplay. This is not a measured benchmark.</p>
      <p>{{ project.graphics_demand.assumptions }}</p>
    </details>
    <p v-else class="graphics-demand">Graphics demand: not rated</p>
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ project: { type: Object, required: true }, compactView: Boolean })
const tags = computed(() => [...new Set((props.project.tags || []).filter(tag => typeof tag === 'string').map(tag => tag.trim().toLowerCase()).filter(Boolean))])
const rating = computed(() => props.project.rating != null && Number(props.project.rating) >= 1 && Number(props.project.rating) <= 10 ? Number(props.project.rating) : null)
const ratingCount = computed(() => Number(props.project.rating_count || 0))
const playCount = computed(() => Number(props.project.play_count || 0))
const ratingWidth = computed(() => `${rating.value == null ? 0 : Math.max(0, Math.min(100, rating.value * 10))}%`)
const ratingLabel = computed(() => rating.value == null ? 'No rating yet' : `${(rating.value / 2).toFixed(1)} out of 5 stars${ratingCount.value ? ` from ${ratingCount.value.toLocaleString()} ${ratingCount.value === 1 ? 'rating' : 'ratings'}` : ''}`)
const playLabel = computed(() => `${playCount.value.toLocaleString()} ${playCount.value === 1 ? 'play' : 'plays'}`)
function compact(value) {
  return Intl.NumberFormat(undefined, { notation: value >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}
function demandLabel(level) {
  return ({ light: 'Light', moderate: 'Moderate', heavy: 'Heavy', extreme: 'Extreme', ultra: 'Ultra', godlike: 'Godlike' })[level] || 'Not rated'
}
</script>

<style scoped>
.graphics-demand { margin: 0.65rem 0 0; font-size: 0.8rem; line-height: 1.5; color: var(--muted, #94a3b8); }
.graphics-demand summary { cursor: pointer; }
.graphics-demand p { margin: 0.4rem 0 0; }
</style>
