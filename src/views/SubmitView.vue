<template>
  <main class="publication-page">
    <section class="publication-card">
      <p class="eyebrow orange">SHARE YOUR GAME</p>
      <h1>Submit your project</h1>
      <p>Paste a public GitHub URL. No sign-in needed.</p>
      <form class="submit-game-form" @submit.prevent="submit">
        <label for="game-url">GitHub URL</label>
        <input id="game-url" v-model="sourceUrl" type="url" required placeholder="https://github.com/owner/game" aria-describedby="game-url-help" :aria-invalid="error ? 'true' : undefined" />
        <small id="game-url-help">Use a repository, a project folder, or an HTML file. We will build your project and create a page to open it.</small>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="submit-game-button" type="submit">Submit your project</button>
      </form>
    </section>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { githubSubmissionPath } from '../lib/github-submission.mjs'

const router = useRouter()
const sourceUrl = ref(''), error = ref('')
async function submit() {
  error.value = ''
  try { await router.push(githubSubmissionPath(sourceUrl.value)) }
  catch (e) { error.value = e.message }
}
</script>
