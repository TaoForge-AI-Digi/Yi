<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProvidersStore } from '@/stores/providers'
import { useCharactersStore } from '@/stores/characters'
import Sidebar from '@/components/Sidebar.vue'

const route = useRoute()
const router = useRouter()
const providersStore = useProvidersStore()
const charactersStore = useCharactersStore()

const activeTab = computed(() => {
  const path = route.path
  if (path === '/task') return 'task'
  if (path === '/role') return 'role'
  if (path === '/skill') return 'skill'
  if (path === '/tool') return 'tool'
  if (path === '/mcp') return 'mcp'
  if (path === '/market') return 'market'
  if (path.startsWith('/settings')) return 'settings'
  return 'chat'
})

const showSidebar = computed(() => activeTab.value === 'chat')

onMounted(async () => {
  await Promise.all([
    providersStore.load(),
    charactersStore.load(),
  ])
})

function switchTab(tab: string) {
  switch (tab) {
    case 'chat': router.push('/c'); break
    case 'task': router.push('/task'); break
    case 'role': router.push('/role'); break
    case 'skill': router.push('/skill'); break
    case 'tool': router.push('/tool'); break
    case 'mcp': router.push('/mcp'); break
    case 'market': router.push('/market'); break
    case 'settings': router.push('/settings'); break
  }
}
</script>

<template>
  <div class="app-layout">
    <nav class="nav-tabs">
      <div class="nav-tabs-logo">
        <img src="/yi-logo.png" alt="Yi" class="nav-logo" />
      </div>
      <button
        :class="['nav-tab', { active: activeTab === 'chat' }]"
        @click="switchTab('chat')"
        title="聊天"
      >
        <span class="nav-tab-icon">💬</span>
        <span class="nav-tab-label">聊天</span>
      </button>
      <button
        :class="['nav-tab', { active: activeTab === 'task' }]"
        @click="switchTab('task')"
        title="任务"
      >
        <span class="nav-tab-icon">📋</span>
        <span class="nav-tab-label">任务</span>
      </button>
      <button
        :class="['nav-tab', { active: activeTab === 'role' }]"
        @click="switchTab('role')"
        title="角色"
      >
        <span class="nav-tab-icon">🎭</span>
        <span class="nav-tab-label">角色</span>
      </button>
      <button
        :class="['nav-tab', { active: activeTab === 'skill' }]"
        @click="switchTab('skill')"
        title="技能"
      >
        <span class="nav-tab-icon">🛠️</span>
        <span class="nav-tab-label">技能</span>
      </button>
      <button
        :class="['nav-tab', { active: activeTab === 'tool' }]"
        @click="switchTab('tool')"
        title="工具"
      >
        <span class="nav-tab-icon">🔧</span>
        <span class="nav-tab-label">工具</span>
      </button>
      <button
        :class="['nav-tab', { active: activeTab === 'mcp' }]"
        @click="switchTab('mcp')"
        title="MCP"
      >
        <span class="nav-tab-icon">🔗</span>
        <span class="nav-tab-label">MCP</span>
      </button>
      <button
        :class="['nav-tab', { active: activeTab === 'market' }]"
        @click="switchTab('market')"
        title="市场"
      >
        <span class="nav-tab-icon">🏪</span>
        <span class="nav-tab-label">市场</span>
      </button>
      <div class="nav-tabs-spacer"></div>
      <button
        :class="['nav-tab', { active: activeTab === 'settings' }]"
        @click="switchTab('settings')"
        title="设置"
      >
        <span class="nav-tab-icon">⚙️</span>
        <span class="nav-tab-label">设置</span>
      </button>
    </nav>
    <Sidebar v-if="showSidebar" />
    <router-view />
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; }
.app-layout { display: flex; height: 100%; }
</style>

<style scoped>
.nav-tabs {
  width: 60px;
  min-width: 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 0 12px;
  background: #2c2c2c;
  gap: 2px;
}

.nav-tabs-spacer {
  flex: 1;
}

.nav-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 48px;
  padding: 8px 0;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: #888;
  transition: all 0.15s ease;
}

.nav-tab:hover {
  background: rgba(255,255,255,0.1);
  color: #ddd;
}

.nav-tab.active {
  background: rgba(255,255,255,0.15);
  color: #fff;
}

.nav-tabs-logo {
  width: 60px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-logo {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

.nav-tab-icon {
  font-size: 20px;
  line-height: 1;
}

.nav-tab-label {
  font-size: 10px;
  line-height: 1;
}
</style>
