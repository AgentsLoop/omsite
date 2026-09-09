<template>
  <section class="social-section" aria-label="Game ratings and reviews">
    <ProjectMetadata :project="{ ...project, ...social }" />
    <details v-if="project.prompt" class="prompt-details">
      <summary>Creation prompt</summary>
      <pre>{{ project.prompt }}</pre>
      <button type="button" @click="copyPrompt">Copy prompt</button>
      <p role="status">{{ copyStatus }}</p>
    </details>
    <p v-if="promptSource" class="source-note"><a :href="promptSource" target="_blank" rel="noopener noreferrer">Prompt source</a></p>
    <h2>Ratings and reviews</h2>
    <p v-if="loading" role="status">Loading reviews…</p>
    <p v-if="error" class="form-error" role="alert">{{ error }} <button v-if="!loaded" type="button" @click="load">Retry</button></p>
    <template v-if="loaded">
      <p v-if="!me"><a class="review-login" href="/auth/github">Sign in with GitHub</a> to rate this game or write a review.</p>
      <form v-else class="review-form" @submit.prevent="save">
        <h3>{{ ownComment ? 'Edit your review' : 'Your review' }}</h3>
        <p>Keep one review per game. You can update it at any time.</p>
        <fieldset :disabled="busy">
          <label for="review-rating">Your rating</label>
          <select id="review-rating" v-model="rating"><option value="">No new rating</option><option v-for="n in 10" :key="n" :value="n">{{ n }} / 10</option></select>
          <button type="button" :disabled="!rating" @click="mutate('rating', 'PUT', { rating: Number(rating) })">Save rating</button>
          <label for="review-body">Comment (optional when saving a rating)</label>
          <textarea id="review-body" v-model="body" rows="5" placeholder="Share your experience with this game"></textarea>
          <div class="review-actions">
            <button type="submit" :disabled="!body.trim()">{{ ownComment ? 'Update review' : 'Post review' }}</button>
            <button v-if="ownComment" type="button" @click="mutate('comment', 'DELETE')">Delete comment</button>
          </div>
        </fieldset>
        <p v-if="ownComment">Deleting your comment keeps your rating.</p>
      </form>
      <p role="status">{{ busy ? 'Saving…' : status }}</p>
      <div class="review-list">
        <article v-for="comment in comments" :key="comment.id" class="review">
          <header><img v-if="comment.avatar_url" :src="comment.avatar_url" alt="" loading="lazy" /><strong>{{ comment.login }}</strong><span v-if="comment.rating != null">{{ comment.rating }} / 10</span></header>
          <p class="review-body">{{ comment.body }}</p>
          <small>{{ date(comment.created_at) }}<template v-if="comment.updated_at && comment.updated_at !== comment.created_at"> · Edited {{ date(comment.updated_at) }}</template></small>
          <button v-if="isOwn(comment)" type="button" :disabled="busy" @click="edit">Edit your review</button>
        </article>
        <p v-if="!comments.length">No reviews yet.</p>
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
watch(() => [props.project.id, props.me?.login], load, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { generation++; controller?.abort() })
</script>
