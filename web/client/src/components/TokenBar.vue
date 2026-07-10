<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
const session = computed(() => chatStore.activeSession)

const ctx = computed(() => chatStore.contextUsage)
const api = computed(() => chatStore.tokenUsage)
const cache = computed(() => session.value?.cacheStats)

const ctxPct = computed(() => ctx.value.show ? ctx.value.pct : 0)
const apiPromptPct = computed(() => ctx.value.total > 0 ? (api.value.input / ctx.value.total) * 100 : 0)
const apiCompletionPct = computed(() => ctx.value.total > 0 ? (api.value.output / ctx.value.total) * 100 : 0)
</script>

<template>
  <div class="token-bar" v-if="api.total > 0 || ctx.show" :title="`API: ${api.total.toLocaleString()} tokens · Context: ${ctx.used.toLocaleString()} / ${ctx.total.toLocaleString()} · Cache: ${cache ? cache.hitTokens + '/' + (cache.hitTokens + cache.missTokens) : '—'}`">
    <div class="track">
      <div class="ctx-fill" :style="{ width: ctxPct + '%' }" />
      <div class="prompt" :style="{ width: apiPromptPct + '%' }" />
      <div class="completion" :style="{ left: apiPromptPct + '%', width: apiCompletionPct + '%' }" />
    </div>
    <span class="label">
      {{ (api.total / 1000).toFixed(1) }}K
      <template v-if="cache"> · cache {{ cache.hitRatio }}%</template>
    </span>
  </div>
</template>

<style scoped>
.token-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 16px; font-size: 10px; color: #888;
}
.track {
  flex: 1; height: 6px; border-radius: 3px; overflow: hidden;
  background: #f0f0f0; position: relative;
}
.ctx-fill {
  position: absolute; top: 0; left: 0; height: 100%;
  background: rgba(25, 118, 210, 0.12);
  transition: width 0.3s;
}
.prompt {
  position: absolute; top: 0; left: 0; height: 100%;
  background: #1976d2; opacity: 0.85;
  transition: width 0.2s;
}
.completion {
  position: absolute; top: 0; height: 100%;
  background: #43a047; opacity: 0.85;
  transition: left 0.2s, width 0.2s;
}
.label { white-space: nowrap; }
</style>
