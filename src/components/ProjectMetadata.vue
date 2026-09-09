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
  </div>
</template>
<script setup>
import { computed } from 'vue'
const props = defineProps({ project: { type: Object, required: true } })
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
</script>
