<template>
  <section class="social-section" aria-label="Game ratings and reviews">
    <ProjectMetadata :project="{ ...project, ...social }" />
    <details v-if="project.prompt" class="prompt-details">
      <summary>{{ project.prompt_source === 'opencode-reconstructed' ? 'Reconstructed creation prompt' : 'Creation prompt' }}</summary>
      <p v-if="project.prompt_source === 'opencode-reconstructed'" class="source-note">Reverse engineered by OC from the game source. The original creation prompt was not found.</p>
      <pre>{{ project.prompt }}</pre>
      <button type="button" @click="copyPrompt">Copy prompt</button>
      <p role="status">{{ copyStatus }}</p>
    </details>
    <p v-if="promptSource" class="source-note"><a :href="promptSource" target="_blank" rel="noopener noreferrer">{{ project.prompt_source === 'opencode-reconstructed' ? 'Game source used for reconstruction' : 'Prompt source' }}</a></p>
    <h2>Player reviews</h2>
    <p v-if="loading" role="status">Loading reviews…</p>
    <p v-if="error" class="form-error" role="alert">{{ error }} <button v-if="!loaded" type="button" @click="load">Retry</button></p>
    <template v-if="loaded">
      <a v-if="!me" class="review-login" href="/auth/github">Write a review</a>
      <form v-else class="review-form" @submit.prevent="save">
        <h3>{{ ownComment ? 'Update your review' : 'What did you think?' }}</h3>
        <fieldset :disabled="busy">
          <div class="rating-picker" role="radiogroup" aria-label="Your rating">
            <button v-for="star in 5" :key="star" type="button" class="rating-star" :class="{ selected: star <= selectedStars }" role="radio" :aria-checked="star === selectedStars" :aria-label="`${star} ${star === 1 ? 'star' : 'stars'}`" @click="rating = star * 2">★</button>
          </div>
          <button class="save-rating" type="button" :disabled="!rating" @click="mutate('rating', 'PUT', { rating: Number(rating) })">Save rating</button>
          <label for="review-body">Share your thoughts</label>
          <textarea id="review-body" v-model="body" rows="4" placeholder="What did you enjoy?"></textarea>
          <div class="review-actions">
            <button type="submit" :disabled="!body.trim()">{{ ownComment ? 'Update review' : 'Post review' }}</button>
            <button v-if="ownComment" type="button" @click="mutate('comment', 'DELETE')">Delete comment</button>
          </div>
        </fieldset>
      </form>
      <p role="status">{{ busy ? 'Saving…' : status }}</p>
      <div class="review-list">
        <article v-for="comment in comments" :key="comment.id" class="review">
          <header><img v-if="comment.avatar_url" :src="comment.avatar_url" alt="" loading="lazy" /><strong>{{ comment.login }}</strong><span v-if="comment.rating != null" class="review-stars" :aria-label="`${(Number(comment.rating) / 2).toFixed(1)} out of 5 stars`"><span aria-hidden="true">{{ reviewStars(comment.rating) }}</span></span></header>
          <p class="review-body">{{ comment.body }}</p>
          <small>{{ date(comment.created_at) }}<template v-if="comment.updated_at && comment.updated_at !== comment.created_at"> · Edited {{ date(comment.updated_at) }}</template></small>
          <button v-if="isOwn(comment)" type="button" :disabled="busy" @click="edit">Edit your review</button>
        </article>
        <p v-if="!comments.length" class="empty-reviews">Be the first to share a review.</p>
      </div>
    </template>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ProjectMetadata from './ProjectMetadata.vue'
const props = defineProps({ project: { type: Object, required: true }, me: Object })
const social = ref({}), loading = ref(false), loaded = ref(false), busy = ref(false), error = ref(''), status = ref(''), body = ref(''), rating = ref(''), copyStatus = ref('')
let generation = 0, controller
const comments = computed(() => [...(social.value.comments || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))))
const selectedStars = computed(() => rating.value === '' ? 0 : Math.round(Number(rating.value) / 2))
const isOwn = comment => Boolean(props.me?.login && comment.login?.toLowerCase() === props.me.login.toLowerCase())
const ownComment = computed(() => comments.value.find(isOwn))
const promptSource = computed(() => {
  try { const url = new URL(props.project.prompt_source_url); return ['https:', 'http:'].includes(url.protocol) ? url.href : '' } catch { return '' }
})
function edit() { body.value = ownComment.value?.body || ''; rating.value = social.value.my_rating ?? ownComment.value?.rating ?? ''; document.getElementById('review-body')?.focus() }
function syncForm() { body.value = ownComment.value?.body || ''; rating.value = social.value.my_rating ?? ownComment.value?.rating ?? '' }
async function request(endpoint, options = {}) {
  const response = await fetch(`/api/projects/${encodeURIComponent(props.project.id)}/${endpoint}`, { credentials: 'same-origin', ...options, signal: controller.signal })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || `Request failed (${response.status}). Please try again.`)
  if (!result || typeof result !== 'object') throw new Error('Could not read the response. Please try again.')
  return result
}
async function load() {
  controller?.abort(); controller = new AbortController(); const current = ++generation
  loading.value = true; loaded.value = false; error.value = ''; busy.value = false; social.value = {}; status.value = ''; body.value = ''; rating.value = ''
  try {
    const result = await request('social')
    if (current !== generation) return
    social.value = result; loaded.value = true; syncForm()
  } catch (failure) { if (current === generation) error.value = failure.message }
  finally { if (current === generation) loading.value = false }
}
async function mutate(endpoint, method, payload) {
  if (busy.value || !loaded.value || !props.me) return
  const current = generation; busy.value = true; error.value = ''; status.value = ''
  try {
    const result = await request(endpoint, { method, ...(payload ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) } : {}) })
    if (current !== generation) return
    social.value = { ...social.value, ...result }; syncForm(); status.value = method === 'DELETE' ? 'Comment deleted. Your rating is kept.' : 'Saved.'
  } catch (failure) { if (current === generation) error.value = failure.message }
  finally { if (current === generation) busy.value = false }
}
function save() { if (body.value.trim()) mutate('comment', 'PUT', { body: body.value.trim(), ...(rating.value !== '' ? { rating: Number(rating.value) } : {}) }) }
async function copyPrompt() {
  const current = generation
  try { await navigator.clipboard.writeText(props.project.prompt); if (current === generation) copyStatus.value = 'Prompt copied.' }
  catch { if (current === generation) copyStatus.value = 'Could not copy. Select the prompt text and copy it.' }
}
function date(value) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString() }
function reviewStars(value) { const filled = Math.round(Number(value) / 2); return '★'.repeat(filled) + '☆'.repeat(5 - filled) }
watch(() => [props.project.id, props.me?.login], load, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { generation++; controller?.abort() })
</script>
