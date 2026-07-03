<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import ProviderSettings from './ProviderSettings.vue'
import DisplaySettings from './DisplaySettings.vue'
import RoleSettings from './RoleSettings.vue'
import SessionSettings from './SessionSettings.vue'
import ToolSettings from './ToolSettings.vue'
import SkillSettings from './SkillSettings.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const tabs = [
  { key: 'role', labelKey: 'settingsNav.role' },
  { key: 'skill', labelKey: 'settingsNav.skill' },
  { key: 'tool', labelKey: 'settingsNav.tool' },
  { key: 'display', labelKey: 'settingsNav.display' },
  { key: 'session', labelKey: 'settingsNav.session' },
  { key: 'provider', labelKey: 'settingsNav.provider' },
  { key: 'about', labelKey: 'settingsNav.about' },
]

const activeTab = computed(() => {
  const tab = route.params.tab
  if (tab && typeof tab === 'string' && tabs.some(t => t.key === tab)) {
    return tab
  }
  return 'role'
})

function switchTab(key: string) {
  router.push(`/settings/${key}`)
}

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="settings-view">
    <aside class="settings-sidebar">
      <div class="settings-sidebar-header">
        <h2 class="settings-title">{{ t('settings.title') }}</h2>
      </div>
      <nav class="settings-nav">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['settings-nav-item', { active: activeTab === tab.key }]"
          @click="switchTab(tab.key)"
        >
          <span class="nav-label">{{ t(tab.labelKey) }}</span>
        </button>
      </nav>
      <div class="settings-sidebar-footer">
        <button class="close-btn" @click="goBack">← Back</button>
      </div>
    </aside>
    <div class="settings-content">
      <ProviderSettings v-if="activeTab === 'provider'" />
      <DisplaySettings v-if="activeTab === 'display'" />
      <RoleSettings v-if="activeTab === 'role'" />
      <SessionSettings v-if="activeTab === 'session'" />
      <ToolSettings v-if="activeTab === 'tool'" />
      <SkillSettings v-if="activeTab === 'skill'" />
      <section v-if="activeTab === 'about'" class="settings-section">
        <h3 class="section-title">{{ t('settingsNav.about') }}</h3>
        <div class="about-info">
          <p><strong>Yi</strong></p>
          <p class="version">Version 0.1.0</p>
          <p class="about-desc">A modern AI chat client built with Vue 3.</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  flex: 1;
  display: flex;
  background: #fff;
}

.settings-sidebar {
  width: 260px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e0e0e0;
  background: #f8f9fa;
}

.settings-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid #e0e0e0;
}

.settings-title {
  font-size: 16px;
  font-weight: 600;
}

.settings-sidebar-footer {
  padding: 8px;
  border-top: 1px solid #e0e0e0;
}

.close-btn {
  width: 100%;
  padding: 6px;
  background: none;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #333;
}

.close-btn:hover {
  background: #e9ecef;
}

.settings-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  text-align: left;
  color: #333;
  transition: all 0.15s ease;
  position: relative;
}

.settings-nav-item:hover {
  background: #e9ecef;
}

.settings-nav-item.active {
  background: #e3f2fd;
  color: #1976d2;
  font-weight: 500;
}

.settings-nav-item.active::before {
  content: '';
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: #1976d2;
  border-radius: 0 2px 2px 0;
}

.nav-label {
  font-size: 13px;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 32px;
  background: #fff;
}

.settings-section {
  max-width: 640px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.section-placeholder {
  color: #999;
  font-size: 14px;
  padding: 20px 0;
}

.about-info p {
  margin-bottom: 8px;
  font-size: 14px;
}

.version {
  color: #666;
}

.about-desc {
  color: #888;
  margin-top: 4px;
}
</style>
