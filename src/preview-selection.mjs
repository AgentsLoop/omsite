export function selectPreview(current, previous, selected) {
  if (!current) return ''
  if (current.preview_url && current.preview_url !== previous?.preview_url) return 'game'
  if (!current.preview_url && current.screenshots?.length && current.screenshots.at(-1) !== previous?.screenshots?.at(-1)) return current.screenshots.at(-1)
  if (selected) return selected
  return current.preview_url ? 'game' : current.screenshots?.at(-1) || (current.project_files_url ? 'files' : '')
}

export function refreshPreviewFrame(previewFrameKey) {
  return previewFrameKey + 1
}

export function switchWorkspacePane(currentPane, nextPane, previewFrameKey) {
  return {
    pane: nextPane,
    previewFrameKey: currentPane === 'chat' && nextPane === 'preview'
      ? refreshPreviewFrame(previewFrameKey)
      : previewFrameKey
  }
}
