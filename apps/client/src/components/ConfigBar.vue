<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useCharactersStore } from '@/stores/characters'
import { useProvidersStore } from '@/stores/providers'

const chatStore = useChatStore()
const charactersStore = useCharactersStore()
const providersStore = useProvidersStore()

const session = computed(() => chatStore.activeSession)

function onCharacterChange(e: Event) {
  const id = (e.target as HTMLSelectElement).value
  charactersStore.setActive(id)
  if (session.value) session.value.character_id = id
}
function onModelChange(e: Event) {
  if (session.value) session.value.model = (e.target as HTMLSelectElement).value
}
function onProviderChange(e: Event) {
  if (session.value) session.value.provider_id = (e.target as HTMLSelectElement).value
}
function onWorkspaceChange(e: Event) {
  if (session.value) session.value.workspace = (e.target as HTMLSelectElement).value
}
</script>

<template>
  <div v-if="session" class="config-bar">
    <label>Character
      <select :value="session.character_id" @change="onCharacterChange">
        <option v-for="c in charactersStore.characters" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </label>
    <label>Model
      <select :value="session.model || ''" @change="onModelChange">
        <option value="">Default</option>
        <option v-for="p in providersStore.providers" :key="p.id" :value="p.models[0]?.id">{{ p.models[0]?.name || p.models[0]?.id }}</option>
      </select>
    </label>
    <label>Provider
      <select :value="session.provider_id || ''" @change="onProviderChange">
        <option value="">Default</option>
        <option v-for="p in providersStore.providers" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </label>
    <label>Workspace
      <input type="text" :value="session.workspace || ''" @change="onWorkspaceChange" placeholder="/path/to/project" />
    </label>
  </div>
</template>

<style scoped>
.config-bar { display: flex; gap: 12px; padding: 8px 12px; border-bottom: 1px solid #e0e0e0; flex-wrap: wrap; }
.config-bar label { font-size: 12px; color: #666; display: flex; flex-direction: column; gap: 2px; }
.config-bar select, .config-bar input { font-size: 13px; padding: 4px 6px; border: 1px solid #ccc; border-radius: 4px; }
.config-bar input { min-width: 200px; }
</style>
