<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink to="/" class="brand" aria-label="OmGithub home">
        <span class="brand-mark">O</span><span>OmGithub</span>
      </RouterLink>
      <nav class="topnav"><a href="/#discover">Discover</a><a href="https://github.com/AgentsLoop/OhMyGithub" target="_blank">GitHub</a></nav>
      <a v-if="!me" class="login-button" href="/auth/github">Sign in with GitHub</a>
      <RouterLink v-else class="user-pill" :to="`/${me.login}`"><img :src="me.avatar_url" alt="" /><span>{{ me.login }}</span></RouterLink>
    </header>
    <RouterView :me="me" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useJsonResource } from './composables/useJsonResource'
const { data } = useJsonResource(() => '/api/me')
const me = computed(() => data.value?.user || null)
</script>
