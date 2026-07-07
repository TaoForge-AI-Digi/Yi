<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import ModelSelector from './Chat/ModelSelector.vue'
import CharacterSelector from './Chat/CharacterSelector.vue'

const { t } = useI18n()
const chatStore = useChatStore()

const session = computed(() => chatStore.activeSession)
function onWorkspaceChange(e: Event) {
  if (session.value) session.value.workspace = (e.target as HTMLSelectElement).value
}
</script>

<template>
  <div v-if="session" class="config-bar">
    <label>{{ t('chat.character') }}
      <CharacterSelector />
    </label>
    <label>{{ t('chat.model') }}
      <ModelSelector />
    </label>
    <label>{{ t('chat.workspace') }}
      <input type="text" :value="session.workspace || ''" @change="onWorkspaceChange" :placeholder="`/${t('chat.workspace').toLowerCase()}/project`" />
    </label>
  </div>
</template>

<style scoped>
.config-bar { display: flex; gap: 12px; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; flex-wrap: wrap; }
.config-bar label { font-size: 12px; color: #666; display: flex; flex-direction: column; gap: 2px; }
.config-bar select, .config-bar input { font-size: 13px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; }
.config-bar input { min-width: 200px; }
</style>
