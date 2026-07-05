<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCharactersStore } from '@/stores/characters'
import { useProvidersStore } from '@/stores/providers'
import SettingRow from './SettingRow.vue'

const { t } = useI18n()
const charactersStore = useCharactersStore()
const providersStore = useProvidersStore()

const characterId = ref(localStorage.getItem('evolutionCharacter') || '')
const groupId = ref(localStorage.getItem('evolutionGroup') || '')
const providerId = ref(localStorage.getItem('evolutionProvider') || '')
const model = ref(localStorage.getItem('evolutionModel') || '')
const workspace = ref(localStorage.getItem('evolutionWorkspace') || '')
const content = ref(localStorage.getItem('evolutionContent') || '')

onMounted(async () => {
  await Promise.all([
    charactersStore.load(),
    providersStore.load(),
  ])
})

const availableChars = computed(() =>
  charactersStore.characters.filter(c => c.role !== 'sub')
)

const selectedCharGroups = computed(() => {
  if (!characterId.value) return []
  const c = charactersStore.characters.find(x => x.id === characterId.value)
  return c?.groups?.filter(g => g.trim()) || []
})

const selectedProviderModels = computed(() => {
  if (!providerId.value) return []
  const p = providersStore.providers.find(x => x.id === providerId.value)
  return p?.models?.filter((m: any) => m.enabled !== false) || []
})

function save() {
  localStorage.setItem('evolutionCharacter', characterId.value)
  localStorage.setItem('evolutionGroup', groupId.value)
  localStorage.setItem('evolutionProvider', providerId.value)
  localStorage.setItem('evolutionModel', model.value)
  localStorage.setItem('evolutionWorkspace', workspace.value)
  localStorage.setItem('evolutionContent', content.value)
}

function clear() {
  characterId.value = ''
  groupId.value = ''
  providerId.value = ''
  model.value = ''
  workspace.value = ''
  content.value = ''
  save()
}
</script>

<template>
  <section class="settings-section">
    <h3 class="section-title">{{ t('event.evolution') }}</h3>
    <p class="section-desc">{{ t('event.evolutionDesc') }}</p>

    <SettingRow :label="t('event.evolutionChar')" :hint="t('event.evolutionCharHint')">
      <select v-model="characterId" class="setting-select" @change="save">
        <option value="">无</option>
        <option v-for="c in availableChars" :key="c.id" :value="c.id">{{ c.name }} ({{ c.id }})</option>
      </select>
    </SettingRow>

    <SettingRow :label="t('event.evolutionGroup')" :hint="t('event.evolutionGroupHint')">
      <select v-model="groupId" class="setting-select" :disabled="selectedCharGroups.length === 0" @change="save">
        <option value="">无</option>
        <option v-for="g in selectedCharGroups" :key="g" :value="g">{{ g }}</option>
      </select>
    </SettingRow>

    <SettingRow :label="t('event.evolutionProvider')" :hint="t('event.evolutionProviderHint')">
      <select v-model="providerId" class="setting-select" @change="save">
        <option value="">无</option>
        <option v-for="p in providersStore.providers" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </SettingRow>

    <SettingRow :label="t('event.evolutionModel')" :hint="t('event.evolutionModelHint')">
      <select v-model="model" class="setting-select" :disabled="!providerId" @change="save">
        <option value="">无</option>
        <option v-for="m in selectedProviderModels" :key="m.id" :value="m.id">{{ m.name || m.id }}</option>
      </select>
    </SettingRow>

    <SettingRow :label="t('event.evolutionWorkspace')" :hint="t('event.evolutionWorkspaceHint')">
      <input v-model="workspace" class="setting-input-wide" placeholder="/path/to/workspace" @change="save" />
    </SettingRow>

    <SettingRow :label="t('event.evolutionContent')" :hint="t('event.evolutionContentHint')">
      <textarea v-model="content" class="setting-textarea" rows="4" :placeholder="t('event.evolutionContentPlaceholder')" @change="save" />
    </SettingRow>

    <div class="form-actions">
      <button class="btn btn-primary" @click="save">{{ t('common.save') }}</button>
      <button class="btn" @click="clear">清除</button>
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  max-width: 640px;
}
.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}
.section-desc {
  font-size: 13px;
  color: #888;
  margin-bottom: 20px;
}
.setting-select {
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 13px;
  min-width: 160px;
}
.setting-select:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
}
.setting-input-wide {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
}
.setting-textarea {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}
.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.btn {
  padding: 7px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.btn-primary {
  background: #007aff;
  color: #fff;
}
.btn:hover:not(.btn-primary) {
  background: #f0f0f0;
}
</style>
