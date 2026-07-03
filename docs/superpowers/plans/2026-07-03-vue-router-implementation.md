# Vue Router 路由化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add vue-router to eliminate refresh navigation instability and enable deep linking for sessions, settings, and panels.

**Architecture:** vue-router with `createWebHistory`, one global `beforeEach` guard for session preloading, and route-driven tab selection in SettingsView.

**Tech Stack:** vue-router 4.x (already in deps), Vue 3 Composition API, Pinia stores

## Global Constraints

- No backend changes — `apps/server/` is untouched
- `vue-router` is already in `package.json`, no install needed
- All changes are in `apps/client/`
- Existing `localStorage` persistence kept as fallback only
- Vite dev server handles SPA fallback automatically

---

### Task 1: Router definition and guard

**Files:**
- Create: `apps/client/src/router/index.ts`
- Modify: `apps/client/src/main.ts`

**Interfaces:**
- Consumes: `chatStore.loadSessions()`, `chatStore.createSession()`, `chatStore.sessions`
- Produces: Named exports `router`, used via `app.use(router)` in main.ts

- [ ] **Step 1: Create router config**

```ts
// apps/client/src/router/index.ts
import { createRouter, createWebHistory } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import ChatView from '@/views/ChatView.vue'
import SettingsView from '@/components/settings/SettingsView.vue'
import NotFound from '@/views/NotFound.vue'

const PERSIST_KEY = 'yi-lin-chat-defaults'

function loadPersistedDefaults() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, string>
  } catch { return {} }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/c',
    },
    {
      path: '/c',
      name: 'chat',
      component: ChatView,
    },
    {
      path: '/c/:id',
      name: 'chat-session',
      component: ChatView,
    },
    {
      path: '/c/:id/files',
      name: 'chat-files',
      component: ChatView,
    },
    {
      path: '/c/:id/outline',
      name: 'chat-outline',
      component: ChatView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
    {
      path: '/settings/:tab',
      name: 'settings-tab',
      component: SettingsView,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFound,
    },
  ],
})

router.beforeEach(async (to) => {
  if (to.path === '/' || to.path.startsWith('/c')) {
    const chatStore = useChatStore()
    if (chatStore.sessions.length === 0) {
      await chatStore.loadSessions()
    }
    if (to.path === '/' || to.path === '/c') {
      const saved = loadPersistedDefaults()
      if (saved.activeSessionId && chatStore.sessions.find(s => s.id === saved.activeSessionId)) {
        return { path: `/c/${saved.activeSessionId}`, replace: true }
      }
      if (chatStore.sessions.length > 0) {
        return { path: `/c/${chatStore.sessions[0].id}`, replace: true }
      }
      const s = await chatStore.createSession()
      return { path: `/c/${s.id}`, replace: true }
    }
  }
})

export default router
```

- [ ] **Step 2: Register router in main.ts**

Edit `apps/client/src/main.ts`:

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n } from './i18n'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.use(router)
app.mount('#app')
```

- [ ] **Step 3: Verify it compiles**

```bash
cd apps/client && npx vue-tsc --noEmit
```

---

### Task 2: Update App.vue — router-view layout

**Files:**
- Modify: `apps/client/src/App.vue`

**Interfaces:**
- Consumes: router (already registered in main.ts)
- Produces: Layout with persistent Sidebar + `<router-view>` content area

- [ ] **Step 1: Replace App.vue template and script**

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useProvidersStore } from '@/stores/providers'
import { useCharactersStore } from '@/stores/characters'
import Sidebar from '@/components/Sidebar.vue'

const providersStore = useProvidersStore()
const charactersStore = useCharactersStore()

onMounted(async () => {
  await Promise.all([
    providersStore.load(),
    charactersStore.load(),
  ])
})
</script>

<template>
  <div class="app-layout">
    <Sidebar />
    <router-view />
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; }
.app-layout { display: flex; height: 100%; }
</style>
```

- [ ] **Step 2: Verify compilation**

```bash
cd apps/client && npx vue-tsc --noEmit
```

---

### Task 3: Create ChatView wrapper with side panel

**Files:**
- Create: `apps/client/src/views/ChatView.vue`
- Create: `apps/client/src/views/NotFound.vue`

**Interfaces:**
- Consumes: `chatStore.switchSession()`, `useRoute()`, `SidePanel`, `ChatArea`
- Produces: Route-matched component for `/c/:id`  family

- [ ] **Step 1: Create ChatView.vue**

```vue
<script setup lang="ts">
import { watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import ChatArea from '@/components/ChatArea.vue'
import SidePanel from '@/components/Panels/SidePanel.vue'

const route = useRoute()
const chatStore = useChatStore()

watch(() => route.params.id, (id) => {
  if (id && typeof id === 'string') {
    chatStore.switchSession(id)
  }
}, { immediate: true })

const showSidePanel = computed(() => route.name === 'chat-files' || route.name === 'chat-outline')
</script>

<template>
  <div class="chat-view">
    <ChatArea />
    <SidePanel v-if="showSidePanel" />
  </div>
</template>

<style scoped>
.chat-view { flex: 1; display: flex; min-width: 0; }
</style>
```

- [ ] **Step 2: Create NotFound.vue**

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="not-found">
    <h1>404</h1>
    <p>Page not found</p>
    <button @click="router.push('/')">Back to Chat</button>
  </div>
</template>

<style scoped>
.not-found { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #666; }
.not-found h1 { font-size: 48px; color: #ccc; }
.not-found button { padding: 8px 16px; border: 1px solid #ddd; border-radius: 6px; background: none; cursor: pointer; }
</style>
```

- [ ] **Step 3: Verify compilation**

```bash
cd apps/client && npx vue-tsc --noEmit
```

---

### Task 4: Update Sidebar navigation

**Files:**
- Modify: `apps/client/src/components/Sidebar.vue`

**Interfaces:**
- Consumes: `useRouter()`, `useRoute()` from vue-router
- Produces: Router-driven session switching and settings navigation

- [ ] **Step 1: Add router imports and update session click**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import SearchBar from './Sidebar/SearchBar.vue'
import FilterBar from './Sidebar/FilterBar.vue'
import WorkspaceGroup from './Sidebar/WorkspaceGroup.vue'
import SettingsBtn from './SettingsBtn.vue'
import BatchActions from './Sidebar/BatchActions.vue'
import { useChatStore } from '@/stores/chat'

const router = useRouter()
const chatStore = useChatStore()

const searchQuery = ref('')
const filterType = ref<'all' | 'starred'>('all')

const filteredWorkspaces = computed(() => {
  let groups = chatStore.workspaceGroups
  if (filterType.value === 'starred') {
    groups = groups.map(g => ({
      ...g,
      sessions: g.sessions.filter(s => s.pinned),
    })).filter(g => g.sessions.length > 0)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    groups = groups.map(g => ({
      ...g,
      sessions: g.sessions.filter(s => s.title.toLowerCase().includes(q)),
    })).filter(g => g.sessions.length > 0)
  }
  return groups
})

function handleSearch(value: string) {
  searchQuery.value = value
}

function handleFilter(type: 'all' | 'starred') {
  filterType.value = type
}

function openSession(id: string) {
  router.push(`/c/${id}`)
}

function newSession() {
  chatStore.createSession().then(s => router.push(`/c/${s.id}`))
}
</script>
```

- [ ] **Step 2: Update template — wire events to router**

```vue
<template>
  <aside class="sidebar">
    <SearchBar @search="handleSearch" />
    <FilterBar :active-filter="filterType" @filter="handleFilter" />
    <div class="session-list">
      <div class="session-list-header">
        <span class="title">Sessions</span>
        <button class="new-btn" @click="newSession">+</button>
        <button class="batch-btn" @click="chatStore.toggleBatchMode()">批量</button>
      </div>
      <WorkspaceGroup
        v-for="group in filteredWorkspaces"
        :key="group.name"
        :workspace="group"
        @select="openSession"
      />
    </div>
    <SettingsBtn />
    <BatchActions v-if="chatStore.isBatchMode" />
  </aside>
</template>
```

- [ ] **Step 3: Update WorkspaceGroup to emit select**

In `apps/client/src/components/Sidebar/WorkspaceGroup.vue`, add `defineEmits` and route selection through emit instead of direct store call:

```vue
<script setup lang="ts">
import WorkspaceHeader from './WorkspaceHeader.vue'
import SessionItem from './SessionItem.vue'
import { useChatStore } from '@/stores/chat'
import type { WorkspaceGroup as WorkspaceGroupType } from '@/stores/chat'

const props = defineProps<{
  workspace: WorkspaceGroupType
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const chatStore = useChatStore()

function createSessionInWorkspace() {
  chatStore.createSession({ workspace: props.workspace.name })
}
</script>

<template>
  <div class="workspace-group">
    <WorkspaceHeader
      :name="workspace.name"
      :collapsed="workspace.collapsed"
      @toggle="chatStore.toggleWorkspaceCollapse(workspace.name)"
      @create="createSessionInWorkspace"
    />
    <div v-if="!workspace.collapsed" class="workspace-sessions">
      <SessionItem
        v-for="session in workspace.sessions"
        :key="session.id"
        :session="session"
        :active="session.id === chatStore.activeSessionId"
        @click="emit('select', session.id)"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Verify compilation**

```bash
cd apps/client && npx vue-tsc --noEmit
```

---

### Task 5: Convert SettingsView from modal to page

**Files:**
- Modify: `apps/client/src/components/settings/SettingsView.vue`
- Modify: `apps/client/src/components/SettingsBtn.vue`

**Interfaces:**
- Consumes: `useRoute()`, `useRouter()` from vue-router
- Produces: Page-level settings component driven by route tab param

- [ ] **Step 1: Update SettingsView — route-driven tabs, remove fixed positioning**

```vue
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
  { key: 'provider', labelKey: 'settingsNav.provider' },
  { key: 'display', labelKey: 'settingsNav.display' },
  { key: 'role', labelKey: 'settingsNav.role' },
  { key: 'session', labelKey: 'settingsNav.session' },
  { key: 'tool', labelKey: 'settingsNav.tool' },
  { key: 'skill', labelKey: 'settingsNav.skill' },
  { key: 'about', labelKey: 'settingsNav.about' },
]

const activeTab = computed(() => {
  const tab = route.params.tab
  if (tab && typeof tab === 'string' && tabs.some(t => t.key === tab)) {
    return tab
  }
  return 'tool'
})

function switchTab(key: string) {
  router.push(`/settings/${key}`)
}

function goBack() {
  router.back()
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
          <p><strong>Yi-Lin</strong></p>
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
```

- [ ] **Step 2: Update SettingsBtn — route navigation instead of modal**

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="settings-btn-area">
    <button class="settings-btn" @click="router.push('/settings')">⚙️ Settings</button>
  </div>
</template>

<style scoped>
.settings-btn-area { padding: 8px; border-top: 1px solid #e0e0e0; }
.settings-btn { width: 100%; padding: 6px; background: none; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 13px; }
.settings-btn:hover { background: #e9ecef; }
</style>
```

- [ ] **Step 3: Verify compilation**

```bash
cd apps/client && npx vue-tsc --noEmit
```

---

### Task 6: Verify everything works

- [ ] **Step 1: Start dev server and manually test**

```bash
cd apps/client && npx vite
```

Test cases:
1. Open `http://localhost:5173/` — redirects to `/c/:id` (existing or new session)
2. Refresh at `/c/:id` — stays on same session
3. Open `/settings/provider` — shows settings with provider tab active
4. Click Back in settings — returns to previous page
5. Click a different session in sidebar — URL updates, chat switches
6. Open `/c/:id/files` — shows side panel with files
7. Open `/c/:id/outline` — shows side panel with outline
8. Open `/nonexistent` — shows 404 page
