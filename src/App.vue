<template>
  <div class="app-shell">
    <header class="site-header">
      <RouterLink to="/" class="brand" aria-label="OmGithub home">
        <span class="brand-symbol" aria-hidden="true"><i></i><i></i><i></i></span><span class="brand-word">omgithub</span>
      </RouterLink>
      <nav class="site-nav" aria-label="Primary navigation"><a href="/#discover">Explore</a><RouterLink to="/submit">Submit</RouterLink><a href="https://github.com/AgentsLoop/OhMyGithub" target="_blank" rel="noopener">Source <span aria-hidden="true">↗</span></a></nav>
      <div class="header-actions"><span class="network-status"><i></i> Systems online</span><a v-if="!me" class="login-button" href="/auth/github">Sign in <span aria-hidden="true">↗</span></a><RouterLink v-else class="user-pill" :to="`/${me.login}`"><img :src="me.avatar_url" alt="" /><span>{{ me.login }}</span></RouterLink></div>
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
