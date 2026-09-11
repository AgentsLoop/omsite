<template>
  <main class="studio">
    <div v-if="loading" class="studio-loading"><span class="spinner large"></span><h2>Opening the live build…</h2></div>
    <template v-else-if="project">
      <header class="studio-bar">
        <div class="studio-title"><p class="eyebrow orange">{{ project.status }}</p><h1>{{ cleanTitle }}</h1></div>
        <div class="studio-progress" aria-label="Build progress">
          <div class="progress-numbers"><span v-for="(step, index) in steps" :key="step.label" :class="step.done ? 'done' : step.active ? 'active' : ''">{{ index + 1 }}</span></div>
          <div class="current-progress"><strong>{{ currentStep.label }}</strong><small>{{ currentStep.copy }}</small></div>
        </div>
        <div class="studio-actions"><a v-if="project.branch_url" class="branch-link" :href="project.branch_url" target="_blank" rel="noopener">View branch ↗</a><a :href="project.github_url" target="_blank">View issue ↗</a><RouterLink v-if="project.project_path" :to="project.project_path">Open Project</RouterLink></div>
      </header>
      <nav class="mobile-pane-tabs" aria-label="Workspace panes"><button :class="mobilePane === 'chat' ? 'active' : ''" @click="showPane('chat')">Chat</button><button :class="mobilePane === 'preview' ? 'active' : ''" @click="showPane('preview')">Preview</button></nav>
      <div class="studio-grid">
        <section class="chat-panel" :class="{ 'mobile-hidden': mobilePane !== 'chat' }">
          <iframe v-if="project.opencode_url" :src="project.opencode_url" allow="clipboard-read; clipboard-write" title="Live OpenCode chat"></iframe>
          <div v-else class="preview-wait workflow-wait">
            <div class="orbit"><span></span></div>
            <h2>{{ workflowFailed ? 'GitHub Actions failed' : 'Preparing OpenCode' }}</h2>
            <div class="workflow-status" :class="{ failed: workflowFailed }">
              <div class="workflow-status-copy"><span>{{ workflowFailed ? 'Failed action' : 'Current action' }}</span><strong>{{ workflowProgress.currentAction }}</strong></div>
              <span class="workflow-count">{{ workflowProgress.completed }} / {{ workflowProgress.total || '—' }}</span>
            </div>
            <div class="workflow-bar" role="progressbar" aria-label="GitHub Actions progress" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="workflowProgress.percent"><span :style="{ width: `${workflowProgress.percent}%` }"></span></div>
            <a v-if="project.actions?.url" :href="project.actions.url" target="_blank">Open GitHub Actions ↗</a>
          </div>
        </section>
        <section class="preview-panel" :class="{ 'mobile-hidden': mobilePane !== 'preview' }">
          <div class="preview-toolbar"><span class="live-dot"></span><strong>{{ previewLabel }}</strong><div class="shot-tabs"><button v-if="project.project_files_url" :class="selectedPreview === 'files' ? 'selected' : ''" @click="selectedPreview = 'files'">Files</button><button v-for="(shot, index) in project.screenshots" :key="shot" :class="displayedShot === shot ? 'selected' : ''" @click="selectedPreview = shot">{{ index + 1 }}</button><button v-if="project.preview_url" :class="selectedPreview === 'game' ? 'selected' : ''" @click="selectedPreview = 'game'">Final Game</button></div><button v-if="previewUrl" class="preview-refresh" type="button" title="Refresh preview" aria-label="Refresh preview" @click="refreshPreview">↻</button><a v-if="displayedShot || previewUrl" :href="displayedShot || previewUrl" target="_blank">Open ↗</a></div>
          <img v-if="displayedShot" class="progress-shot" :src="displayedShot" alt="Latest game progress screenshot" @click="selectedShot = displayedShot" />
          <iframe v-else-if="previewUrl" :key="previewFrameKey" :src="previewUrl" allow="fullscreen; clipboard-read; clipboard-write" title="Live project preview"></iframe>
          <div v-else class="preview-wait"><div class="orbit"><span></span></div><h2>Waiting for preview</h2><p>Progress screenshots appear here while OpenCode builds. The verified game replaces them when it is ready.</p></div>
        </section>
      </div>
      <div v-if="selectedShot" class="lightbox" @click="selectedShot = ''"><img :src="selectedShot" alt="Screenshot enlarged" /></div>
    </template>
    <div v-else class="error-page"><h1>Project not found</h1><p>{{ error }}</p></div>
  </main>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { refreshPreviewFrame, selectPreview, switchWorkspacePane } from '../preview-selection.mjs'
import { summarizeWorkflowProgress } from '../workflow-progress.mjs'
import { useRoute } from 'vue-router'
import { useJsonResource } from '../composables/useJsonResource'
const route = useRoute(), selectedShot = ref(''), selectedPreview = ref(''), mobilePane = ref('chat'), previewFrameKey = ref(0)
const { data: project, loading, error } = useJsonResource(
  () => `/api/github/${encodeURIComponent(route.params.owner)}/${encodeURIComponent(route.params.repo)}/issues/${encodeURIComponent(route.params.number)}`,
  { pollMs: 8000 }
)
const cleanTitle = computed(() => (project.value?.title || '').replace(/^\/goal\s*/i, ''))
const displayedShot = computed(() => ['files', 'game', ''].includes(selectedPreview.value) ? '' : selectedPreview.value)
const previewUrl = computed(() => selectedPreview.value === 'files' ? project.value?.project_files_url || '' : selectedPreview.value === 'game' ? project.value?.preview_url || '' : '')
const previewLabel = computed(() => displayedShot.value ? 'Build screenshot' : selectedPreview.value === 'files' ? 'Project files' : selectedPreview.value === 'game' ? 'Final game' : project.value?.screenshots?.length ? 'Build screenshot' : 'Waiting for preview')
const failedStates = new Set(['action_required', 'cancelled', 'failure', 'startup_failure', 'timed_out'])
const workflowFailed = computed(() => failedStates.has(project.value?.actions?.status))
const currentGithubAction = computed(() => project.value?.actions?.active_step || '')
const workflowProgress = computed(() => summarizeWorkflowProgress(project.value?.actions))
function refreshPreview() {
  previewFrameKey.value = refreshPreviewFrame(previewFrameKey.value)
}
function showPane(nextPane) {
  const next = switchWorkspacePane(mobilePane.value, nextPane, previewFrameKey.value)
  mobilePane.value = next.pane
  previewFrameKey.value = next.previewFrameKey
}
const steps = computed(() => {
  const p = project.value || {}; const complete = p.status === 'complete'
  return [
    { label: 'Issue created', copy: `#${route.params.number} on GitHub`, done: true },
    { label: 'OpenCode building', copy: p.opencode_url ? 'Live session available' : 'Runner is starting', done: Boolean(p.opencode_url), active: !p.opencode_url },
    { label: 'Browser verification', copy: p.preview_url ? 'Public preview verified' : 'Waiting for preview', done: Boolean(p.preview_url), active: Boolean(p.opencode_url && !p.preview_url) },
    { label: 'Published', copy: p.project_path || 'Immutable project link pending', done: Boolean(p.project_path), active: complete && !p.project_path }
  ]
})
const currentStep = computed(() => currentGithubAction.value
  ? { label: 'GitHub Actions', copy: currentGithubAction.value }
  : steps.value.find(step => step.active) || [...steps.value].reverse().find(step => step.done) || steps.value[0])
watch(project, (current, previous) => {
  selectedPreview.value = selectPreview(current, previous, selectedPreview.value)
  if (!current) selectedShot.value = ''
})
</script>
