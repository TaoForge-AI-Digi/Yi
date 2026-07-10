<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingRow from './SettingRow.vue'

const { t } = useI18n()

const streaming = ref(true)
const compact = ref(false)
const showReasoning = ref(true)
const showCost = ref(false)

const DEFAULT_DEFAULT_WORKSPACE = 'C:\\.Yi'
const PERSIST_KEY = 'yi-lin-chat-defaults'

const defaultWorkspace = ref(DEFAULT_DEFAULT_WORKSPACE)

onMounted(() => {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.defaultWorkspace) defaultWorkspace.value = parsed.defaultWorkspace
    }
  } catch { /* ignore */ }
})

function saveDefaultWorkspace() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    const existing = raw ? JSON.parse(raw) : {}
    existing.defaultWorkspace = defaultWorkspace.value || DEFAULT_DEFAULT_WORKSPACE
    localStorage.setItem(PERSIST_KEY, JSON.stringify(existing))
  } catch { /* ignore */ }
}
</script>

<template>
  <section class="settings-section">
    <h3 class="section-title">{{ t('session.title') }}</h3>
    <p class="section-desc">{{ t('session.desc') }}</p>

    <SettingRow :label="t('session.defaultWorkspace')" :hint="t('session.defaultWorkspaceHint')">
      <div class="path-input-wrap">
        <input v-model="defaultWorkspace" type="text" class="path-input" @change="saveDefaultWorkspace" />
      </div>
    </SettingRow>

    <SettingRow :label="t('display.streaming')" :hint="t('display.streamingHint')">
      <label class="switch">
        <input v-model="streaming" type="checkbox" />
        <span class="switch-slider"></span>
      </label>
    </SettingRow>

    <SettingRow :label="t('display.compact')" :hint="t('display.compactHint')">
      <label class="switch">
        <input v-model="compact" type="checkbox" />
        <span class="switch-slider"></span>
      </label>
    </SettingRow>

    <SettingRow :label="t('display.showReasoning')" :hint="t('display.showReasoningHint')">
      <label class="switch">
        <input v-model="showReasoning" type="checkbox" />
        <span class="switch-slider"></span>
      </label>
    </SettingRow>

    <SettingRow :label="t('display.showCost')" :hint="t('display.showCostHint')">
      <label class="switch">
        <input v-model="showCost" type="checkbox" />
        <span class="switch-slider"></span>
      </label>
    </SettingRow>
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

.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #ccc;
  border-radius: 22px;
  transition: 0.2s;
}

.switch-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 2px;
  bottom: 2px;
  background: #fff;
  border-radius: 50%;
  transition: 0.2s;
}

.switch input:checked + .switch-slider {
  background: #1976d2;
}

.switch input:checked + .switch-slider::before {
  transform: translateX(18px);
}

.setting-input {
  width: 80px;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
}

.path-input-wrap {
  flex: 1;
  min-width: 0;
}

.path-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 13px;
  box-sizing: border-box;
}
</style>
