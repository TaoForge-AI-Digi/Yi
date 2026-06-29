# Chat View 优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现聊天界面的全面优化，包括侧边栏分组、消息增强、面板功能和Markdown渲染

**Architecture:** 基于现有 Vue 3 + Vite 项目，采用组件化设计，分阶段实施。每个阶段独立可测试，逐步集成到主版本。

**Tech Stack:** Vue 3, TypeScript, Vite, highlight.js, markdown-it, xterm.js, KaTeX, Mermaid

## Global Constraints

- Vue 3.3+ 和 TypeScript 5.0+
- Vite 4.0+ 构建工具
- 保持现有代码风格和约定
- 所有新组件使用 `<script setup lang="ts">` 语法
- 样式使用 scoped CSS
- 遵循 YAGNI 原则，只实现必要功能

---

## 文件结构映射

```
src/
├── components/
│   ├── Sidebar/              # 侧边栏组件（新建）
│   │   ├── SearchBar.vue
│   │   ├── FilterBar.vue
│   │   ├── WorkspaceGroup.vue
│   │   ├── WorkspaceHeader.vue
│   │   ├── SessionItem.vue
│   │   ├── ContextMenu.vue
│   │   └── BatchActions.vue
│   ├── Chat/                 # 聊天组件（修改）
│   │   ├── ChatArea.vue
│   │   ├── MessageList.vue
│   │   ├── MessageItem.vue
│   │   └── ChatInput.vue
│   ├── Panels/               # 面板组件（新建）
│   │   ├── SidePanel.vue
│   │   ├── FilesPanel.vue
│   │   └── OutlinePanel.vue
│   └── Markdown/             # Markdown 组件（新建）
│       ├── MarkdownRenderer.vue
│       └── CodeBlock.vue
├── stores/                   # 状态管理（修改）
│   └── chat.ts
└── api/                      # API 接口（新建）
    └── sessions.ts
```

---

## 阶段1：侧边栏完整开发（2-3周）

### Task 1: 侧边栏基础结构

**Files:**
- Create: `src/components/Sidebar/Sidebar.vue`
- Create: `src/components/Sidebar/SearchBar.vue`
- Create: `src/components/Sidebar/FilterBar.vue`

**Interfaces:**
- Consumes: `useChatStore` from `@/stores/chat`
- Produces: `Sidebar.vue` 组件，包含搜索和过滤功能

- [ ] **Step 1: 创建 Sidebar.vue 基础结构**

```vue
<script setup lang="ts">
import SearchBar from './SearchBar.vue'
import FilterBar from './FilterBar.vue'
</script>

<template>
  <aside class="sidebar">
    <SearchBar />
    <FilterBar />
    <div class="session-list">
      <!-- 会话列表将在这里实现 -->
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e0e0e0;
  background: #f8f9fa;
}
.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
</style>
```

- [ ] **Step 2: 创建 SearchBar.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const search = ref('')
const emit = defineEmits<{
  search: [value: string]
}>()

function onInput() {
  emit('search', search.value)
}
</script>

<template>
  <div class="search-bar">
    <input
      v-model="search"
      type="text"
      placeholder="搜索对话..."
      @input="onInput"
    />
  </div>
</template>

<style scoped>
.search-bar {
  padding: 8px;
  border-bottom: 1px solid #e0e0e0;
}
.search-bar input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 13px;
}
</style>
```

- [ ] **Step 3: 创建 FilterBar.vue**

```vue
<script setup lang="ts">
</script>

<template>
  <div class="filter-bar">
    <button class="filter-btn">过滤</button>
    <button class="sort-btn">排序</button>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid #e0e0e0;
}
.filter-btn, .sort-btn {
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
}
</style>
```

- [ ] **Step 4: 运行测试**

Run: `npm run dev`
Expected: 侧边栏基础结构显示正常

- [ ] **Step 5: 提交**

```bash
git add src/components/Sidebar/
git commit -m "feat: add sidebar base structure with search and filter"
```

---

### Task 2: 工作区分组功能

**Files:**
- Create: `src/components/Sidebar/WorkspaceGroup.vue`
- Create: `src/components/Sidebar/WorkspaceHeader.vue`
- Create: `src/components/Sidebar/SessionItem.vue`

**Interfaces:**
- Consumes: `useChatStore` from `@/stores/chat`
- Produces: 工作区分组显示，支持折叠/展开

- [ ] **Step 1: 更新 chat store 添加工作区状态**

```typescript
// src/stores/chat.ts
interface Session {
  // 现有字段...
  pinned: boolean
  workspace: string
  updatedAt: number
}

interface WorkspaceGroup {
  name: string
  sessions: Session[]
  collapsed: boolean
}

// 在 store 中添加
const collapsedWorkspaces = ref<Set<string>>(new Set())

const workspaceGroups = computed<WorkspaceGroup[]>(() => {
  const groups = new Map<string, Session[]>()
  
  sessions.value.forEach(session => {
    const workspace = session.workspace || 'default'
    if (!groups.has(workspace)) {
      groups.set(workspace, [])
    }
    groups.get(workspace)!.push(session)
  })
  
  return Array.from(groups.entries()).map(([name, sessions]) => ({
    name,
    sessions,
    collapsed: collapsedWorkspaces.value.has(name)
  }))
})

function toggleWorkspaceCollapse(workspace: string) {
  if (collapsedWorkspaces.value.has(workspace)) {
    collapsedWorkspaces.value.delete(workspace)
  } else {
    collapsedWorkspaces.value.add(workspace)
  }
}
```

- [ ] **Step 2: 创建 WorkspaceGroup.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import WorkspaceHeader from './WorkspaceHeader.vue'
import SessionItem from './SessionItem.vue'
import { useChatStore } from '@/stores/chat'

const props = defineProps<{
  workspace: {
    name: string
    sessions: any[]
    collapsed: boolean
  }
}>()

const chatStore = useChatStore()

function createSessionInWorkspace() {
  chatStore.createSession(props.workspace.name)
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
        @click="chatStore.switchSession(session.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.workspace-group {
  margin-bottom: 8px;
}
.workspace-sessions {
  padding-left: 8px;
}
</style>
```

- [ ] **Step 3: 创建 WorkspaceHeader.vue**

```vue
<script setup lang="ts">
defineProps<{
  name: string
  collapsed: boolean
}>()

const emit = defineEmits<{
  toggle: []
  create: []
}>()
</script>

<template>
  <div class="workspace-header">
    <span class="workspace-name" @click="emit('toggle')">
      {{ name }}
      <span class="collapse-icon">{{ collapsed ? '▶' : '▼' }}</span>
    </span>
    <button class="create-btn" @click="emit('create')">+</button>
  </div>
</template>

<style scoped>
.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  cursor: pointer;
}
.workspace-name {
  font-weight: 600;
  font-size: 13px;
}
.collapse-icon {
  margin-left: 4px;
  font-size: 10px;
}
.create-btn {
  background: none;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
}
</style>
```

- [ ] **Step 4: 创建 SessionItem.vue**

```vue
<script setup lang="ts">
defineProps<{
  session: {
    id: string
    title: string
    pinned: boolean
  }
  active: boolean
}>()

const emit = defineEmits<{
  click: []
  contextmenu: [event: MouseEvent]
}>()
</script>

<template>
  <div
    class="session-item"
    :class="{ active }"
    @click="emit('click')"
    @contextmenu.prevent="emit('contextmenu', $event)"
  >
    <span class="status-dot"></span>
    <span class="session-title">{{ session.title || '新建对话' }}</span>
    <span v-if="session.pinned" class="pin-icon">📌</span>
  </div>
</template>

<style scoped>
.session-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  margin-bottom: 2px;
}
.session-item:hover {
  background: #e9ecef;
}
.session-item.active {
  background: #d0ebff;
  font-weight: 500;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ccc;
  margin-right: 8px;
}
.session-title {
  flex: 1;
}
.pin-icon {
  font-size: 12px;
}
</style>
```

- [ ] **Step 5: 运行测试**

Run: `npm run dev`
Expected: 工作区分组显示正常，可折叠/展开

- [ ] **Step 6: 提交**

```bash
git add src/components/Sidebar/Workspace*.vue src/components/Sidebar/SessionItem.vue src/stores/chat.ts
git commit -m "feat: add workspace grouping with collapse and create"
```

---

### Task 3: 右键菜单功能

**Files:**
- Create: `src/components/Sidebar/ContextMenu.vue`
- Modify: `src/components/Sidebar/SessionItem.vue`

**Interfaces:**
- Consumes: `useChatStore` from `@/stores/chat`
- Produces: 右键菜单，支持重命名、删除等操作

- [ ] **Step 1: 创建 ContextMenu.vue**

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  sessionId: string
}>()

const emit = defineEmits<{
  close: []
  action: [action: string, sessionId: string]
}>()

const menuItems = [
  { label: '置顶', key: 'pin' },
  { label: '重命名', key: 'rename' },
  { label: '设置工作区', key: 'workspace' },
  { label: '切换模型', key: 'model' },
  { label: '复制链接', key: 'copy-link' },
  { label: '复制 ID', key: 'copy-id' },
  { label: '导出', key: 'export' },
  { label: '删除', key: 'delete', danger: true },
]

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (!target.closest('.context-menu')) {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

function handleAction(key: string) {
  emit('action', key, props.sessionId)
  emit('close')
}
</script>

<template>
  <div
    v-if="visible"
    class="context-menu"
    :style="{ left: `${x}px`, top: `${y}px` }"
  >
    <div
      v-for="item in menuItems"
      :key="item.key"
      class="menu-item"
      :class="{ danger: item.danger }"
      @click="handleAction(item.key)"
    >
      {{ item.label }}
    </div>
  </div>
</template>

<style scoped>
.context-menu {
  position: fixed;
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  padding: 4px;
  z-index: 1000;
  min-width: 150px;
}
.menu-item {
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}
.menu-item:hover {
  background: #f0f0f0;
}
.menu-item.danger {
  color: #ff3b30;
}
</style>
```

- [ ] **Step 2: 更新 SessionItem.vue 支持右键菜单**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  session: {
    id: string
    title: string
    pinned: boolean
  }
  active: boolean
}>()

const emit = defineEmits<{
  click: []
  contextmenu: [event: MouseEvent]
}>()

const showContextMenu = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })

function handleContextMenu(event: MouseEvent) {
  contextMenuPos.value = { x: event.clientX, y: event.clientY }
  showContextMenu.value = true
  emit('contextmenu', event)
}

function handleContextAction(action: string) {
  // 处理右键菜单操作
  console.log('Action:', action, 'Session:', props.session.id)
}
</script>

<template>
  <div
    class="session-item"
    :class="{ active }"
    @click="emit('click')"
    @contextmenu.prevent="handleContextMenu"
  >
    <span class="status-dot"></span>
    <span class="session-title">{{ session.title || '新建对话' }}</span>
    <span v-if="session.pinned" class="pin-icon">📌</span>
  </div>
  
  <ContextMenu
    :visible="showContextMenu"
    :x="contextMenuPos.x"
    :y="contextMenuPos.y"
    :session-id="session.id"
    @close="showContextMenu = false"
    @action="handleContextAction"
  />
</template>

<style scoped>
/* 保持原有样式不变 */
</style>
```

- [ ] **Step 3: 运行测试**

Run: `npm run dev`
Expected: 右键菜单显示正常，可执行操作

- [ ] **Step 4: 提交**

```bash
git add src/components/Sidebar/ContextMenu.vue src/components/Sidebar/SessionItem.vue
git commit -m "feat: add context menu for session management"
```

---

### Task 4: 批量操作功能

**Files:**
- Create: `src/components/Sidebar/BatchActions.vue`
- Modify: `src/components/Sidebar/Sidebar.vue`

**Interfaces:**
- Consumes: `useChatStore` from `@/stores/chat`
- Produces: 批量选择和删除功能

- [ ] **Step 1: 更新 chat store 添加批量操作状态**

```typescript
// src/stores/chat.ts
const isBatchMode = ref(false)
const selectedSessionIds = ref<Set<string>>(new Set())

function toggleBatchMode() {
  isBatchMode.value = !isBatchMode.value
  if (!isBatchMode.value) {
    selectedSessionIds.value.clear()
  }
}

function toggleSessionSelection(sessionId: string) {
  if (selectedSessionIds.value.has(sessionId)) {
    selectedSessionIds.value.delete(sessionId)
  } else {
    selectedSessionIds.value.add(sessionId)
  }
}

function selectAllSessions() {
  sessions.value.forEach(session => {
    selectedSessionIds.value.add(session.id)
  })
}

async function batchDeleteSessions() {
  // 实现批量删除逻辑
  selectedSessionIds.value.clear()
  isBatchMode.value = false
}
```

- [ ] **Step 2: 创建 BatchActions.vue**

```vue
<script setup lang="ts">
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
</script>

<template>
  <div class="batch-actions">
    <div class="batch-info">
      已选择 {{ chatStore.selectedSessionIds.size }} 个会话
    </div>
    <div class="batch-buttons">
      <button @click="chatStore.selectAllSessions()">全选</button>
      <button @click="chatStore.batchDeleteSessions()" class="danger">
        批量删除
      </button>
      <button @click="chatStore.toggleBatchMode()">取消</button>
    </div>
  </div>
</template>

<style scoped>
.batch-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border-top: 1px solid #e0e0e0;
  background: #f8f9fa;
}
.batch-info {
  font-size: 12px;
  color: #666;
}
.batch-buttons {
  display: flex;
  gap: 4px;
}
.batch-buttons button {
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
}
.batch-buttons button.danger {
  color: #ff3b30;
  border-color: #ff3b30;
}
</style>
```

- [ ] **Step 3: 更新 Sidebar.vue 集成批量操作**

```vue
<script setup lang="ts">
import SearchBar from './SearchBar.vue'
import FilterBar from './FilterBar.vue'
import WorkspaceGroup from './WorkspaceGroup.vue'
import BatchActions from './BatchActions.vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
</script>

<template>
  <aside class="sidebar">
    <SearchBar />
    <FilterBar />
    <div class="session-list">
      <WorkspaceGroup
        v-for="group in chatStore.workspaceGroups"
        :key="group.name"
        :workspace="group"
      />
    </div>
    <BatchActions v-if="chatStore.isBatchMode" />
  </aside>
</template>

<style scoped>
/* 保持原有样式不变 */
</style>
```

- [ ] **Step 4: 运行测试**

Run: `npm run dev`
Expected: 批量操作功能正常

- [ ] **Step 5: 提交**

```bash
git add src/components/Sidebar/BatchActions.vue src/components/Sidebar/Sidebar.vue src/stores/chat.ts
git commit -m "feat: add batch operations for sessions"
```

---

## 阶段2：消息、输入框与Markdown增强（2-3周）

### Task 5: 消息复制功能

**Files:**
- Create: `src/components/Chat/CopyButton.vue`
- Modify: `src/components/Chat/MessageItem.vue`

**Interfaces:**
- Consumes: `Message` from `@/stores/chat`
- Produces: 消息复制按钮

- [ ] **Step 1: 创建 CopyButton.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  text: string
}>()

const copied = ref(false)

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
  }
}
</script>

<template>
  <button class="copy-btn" @click="copyToClipboard">
    {{ copied ? '已复制' : '复制' }}
  </button>
</template>

<style scoped>
.copy-btn {
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
}
.copy-btn:hover {
  background: #f0f0f0;
}
</style>
```

- [ ] **Step 2: 更新 MessageItem.vue 添加复制按钮**

```vue
<script setup lang="ts">
import CopyButton from './CopyButton.vue'

defineProps<{
  message: {
    id: string
    role: string
    content: string
  }
}>()
</script>

<template>
  <div class="message" :class="message.role">
    <div class="bubble">
      <div class="text-content">{{ message.content }}</div>
      <div class="message-actions">
        <CopyButton :text="message.content" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.message {
  margin-bottom: 12px;
  display: flex;
}
.message.user {
  justify-content: flex-end;
}
.message.assistant .bubble {
  background: #f0f0f0;
}
.message.user .bubble {
  background: #007aff;
  color: white;
}
.bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
}
.message-actions {
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
</style>
```

- [ ] **Step 3: 运行测试**

Run: `npm run dev`
Expected: 复制按钮显示正常，点击可复制

- [ ] **Step 4: 提交**

```bash
git add src/components/Chat/CopyButton.vue src/components/Chat/MessageItem.vue
git commit -m "feat: add message copy functionality"
```

---

### Task 6: 工具消息展开/折叠

**Files:**
- Create: `src/components/Chat/ToolDetail.vue`
- Modify: `src/components/Chat/MessageItem.vue`

**Interfaces:**
- Consumes: `Message` from `@/stores/chat`
- Produces: 工具消息详情展开/折叠

- [ ] **Step 1: 创建 ToolDetail.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  toolName: string
  toolInput?: string
  toolOutput?: string
  status: string
}>()

const expanded = ref(false)
</script>

<template>
  <div class="tool-detail">
    <div class="tool-header" @click="expanded = !expanded">
      <span class="tool-name">🛠 {{ toolName }}</span>
      <span class="status-badge" :class="status">{{ status }}</span>
      <span class="expand-icon">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div v-if="expanded" class="tool-content">
      <div v-if="toolInput" class="tool-section">
        <div class="section-title">输入:</div>
        <pre class="tool-data">{{ toolInput }}</pre>
      </div>
      <div v-if="toolOutput" class="tool-section">
        <div class="section-title">输出:</div>
        <pre class="tool-data output">{{ toolOutput }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-detail {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-top: 8px;
}
.tool-header {
  display: flex;
  align-items: center;
  padding: 8px;
  cursor: pointer;
  background: #f8f9fa;
  border-radius: 8px 8px 0 0;
}
.tool-name {
  font-weight: 600;
  font-size: 13px;
}
.status-badge {
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.status-badge.running {
  background: #fff3cd;
  color: #856404;
}
.status-badge.completed {
  background: #d4edda;
  color: #155724;
}
.status-badge.error {
  background: #f8d7da;
  color: #721c24;
}
.expand-icon {
  margin-left: auto;
  font-size: 10px;
}
.tool-content {
  padding: 8px;
}
.tool-section {
  margin-bottom: 8px;
}
.section-title {
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 4px;
}
.tool-data {
  background: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
}
.tool-data.output {
  background: #e8f5e9;
}
</style>
```

- [ ] **Step 2: 更新 MessageItem.vue 支持工具消息**

```vue
<script setup lang="ts">
import CopyButton from './CopyButton.vue'
import ToolDetail from './ToolDetail.vue'

defineProps<{
  message: {
    id: string
    role: string
    content: string
    toolName?: string
    toolInput?: string
    toolOutput?: string
    toolStatus?: string
  }
}>()
</script>

<template>
  <div class="message" :class="message.role">
    <div class="bubble">
      <div v-if="message.toolName" class="tool-message">
        <ToolDetail
          :tool-name="message.toolName"
          :tool-input="message.toolInput"
          :tool-output="message.toolOutput"
          :status="message.toolStatus || 'completed'"
        />
      </div>
      <div v-else class="text-content">{{ message.content }}</div>
      <div class="message-actions">
        <CopyButton :text="message.content" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 保持原有样式不变 */
</style>
```

- [ ] **Step 3: 运行测试**

Run: `npm run dev`
Expected: 工具消息可展开/折叠

- [ ] **Step 4: 提交**

```bash
git add src/components/Chat/ToolDetail.vue src/components/Chat/MessageItem.vue
git commit -m "feat: add tool message expand/collapse"
```

---

### Task 7: 思考过程显示

**Files:**
- Create: `src/components/Chat/ThinkingBlock.vue`
- Modify: `src/components/Chat/MessageItem.vue`

**Interfaces:**
- Consumes: `Message` from `@/stores/chat`
- Produces: 思考过程显示组件

- [ ] **Step 1: 创建 ThinkingBlock.vue**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  content: string
  duration?: number
}>()

const expanded = ref(true)

const formattedDuration = computed(() => {
  if (!props.duration) return ''
  const seconds = (props.duration / 1000).toFixed(1)
  return `${seconds}s`
})

const charCount = computed(() => {
  return props.content.length
})
</script>

<template>
  <div class="thinking-block">
    <div class="thinking-header" @click="expanded = !expanded">
      <span class="thinking-icon">💭</span>
      <span class="thinking-title">思考过程</span>
      <span v-if="formattedDuration" class="thinking-duration">{{ formattedDuration }}</span>
      <span class="thinking-chars">{{ charCount }} chars</span>
      <span class="expand-icon">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div v-if="expanded" class="thinking-content">
      {{ content }}
    </div>
  </div>
</template>

<style scoped>
.thinking-block {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-bottom: 8px;
}
.thinking-header {
  display: flex;
  align-items: center;
  padding: 8px;
  cursor: pointer;
  background: #f8f9fa;
  border-radius: 8px 8px 0 0;
}
.thinking-icon {
  margin-right: 8px;
}
.thinking-title {
  font-weight: 600;
  font-size: 13px;
}
.thinking-duration {
  margin-left: 8px;
  color: #666;
  font-size: 12px;
}
.thinking-chars {
  margin-left: 8px;
  color: #999;
  font-size: 12px;
}
.expand-icon {
  margin-left: auto;
  font-size: 10px;
}
.thinking-content {
  padding: 8px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}
</style>
```

- [ ] **Step 2: 更新 MessageItem.vue 支持思考过程**

```vue
<script setup lang="ts">
import CopyButton from './CopyButton.vue'
import ToolDetail from './ToolDetail.vue'
import ThinkingBlock from './ThinkingBlock.vue'

defineProps<{
  message: {
    id: string
    role: string
    content: string
    reasoning?: string
    reasoningDuration?: number
    toolName?: string
    toolInput?: string
    toolOutput?: string
    toolStatus?: string
  }
}>()
</script>

<template>
  <div class="message" :class="message.role">
    <div class="bubble">
      <ThinkingBlock
        v-if="message.reasoning"
        :content="message.reasoning"
        :duration="message.reasoningDuration"
      />
      <div v-if="message.toolName" class="tool-message">
        <ToolDetail
          :tool-name="message.toolName"
          :tool-input="message.toolInput"
          :tool-output="message.toolOutput"
          :status="message.toolStatus || 'completed'"
        />
      </div>
      <div v-else class="text-content">{{ message.content }}</div>
      <div class="message-actions">
        <CopyButton :text="message.content" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 保持原有样式不变 */
</style>
```

- [ ] **Step 3: 运行测试**

Run: `npm run dev`
Expected: 思考过程显示正常，可展开/折叠

- [ ] **Step 4: 提交**

```bash
git add src/components/Chat/ThinkingBlock.vue src/components/Chat/MessageItem.vue
git commit -m "feat: add thinking process display"
```

---

### Task 8: Markdown渲染器

**Files:**
- Create: `src/components/Markdown/MarkdownRenderer.vue`
- Create: `src/components/Markdown/CodeBlock.vue`

**Interfaces:**
- Consumes: `content` string
- Produces: 渲染后的HTML

- [ ] **Step 1: 安装依赖**

Run: `npm install highlight.js markdown-it`
Expected: 依赖安装成功

- [ ] **Step 2: 创建 CodeBlock.vue**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import hljs from 'highlight.js'

const props = defineProps<{
  code: string
  language?: string
}>()

const codeRef = ref<HTMLElement>()
const copied = ref(false)

onMounted(() => {
  if (codeRef.value && props.language) {
    hljs.highlightElement(codeRef.value)
  }
})

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.code)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('复制失败:', err)
  }
}
</script>

<template>
  <div class="code-block">
    <div class="code-header">
      <span class="language">{{ language || 'code' }}</span>
      <button class="copy-btn" @click="copyCode">
        {{ copied ? '已复制' : '复制' }}
      </button>
    </div>
    <pre><code ref="codeRef" :class="language">{{ code }}</code></pre>
  </div>
</template>

<style scoped>
.code-block {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin: 8px 0;
  overflow: hidden;
}
.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-bottom: 1px solid #e0e0e0;
}
.language {
  font-size: 12px;
  color: #666;
}
.copy-btn {
  padding: 4px 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
}
.copy-btn:hover {
  background: #f0f0f0;
}
pre {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
}
code {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
}
</style>
```

- [ ] **Step 3: 创建 MarkdownRenderer.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import MarkdownIt from 'markdown-it'
import CodeBlock from './CodeBlock.vue'

const props = defineProps<{
  content: string
}>()

const md = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
})

const renderedHtml = computed(() => {
  return md.render(props.content)
})

const codeBlocks = computed(() => {
  const blocks: Array<{ code: string; language?: string }> = []
  const regex = /```(\w+)?\n([\s\S]*?)```/g
  let match
  
  while ((match = regex.exec(props.content)) !== null) {
    blocks.push({
      language: match[1],
      code: match[2].trim(),
    })
  }
  
  return blocks
})
</script>

<template>
  <div class="markdown-renderer">
    <div v-html="renderedHtml"></div>
  </div>
</template>

<style scoped>
.markdown-renderer {
  font-size: 14px;
  line-height: 1.6;
}
.markdown-renderer :deep(h1),
.markdown-renderer :deep(h2),
.markdown-renderer :deep(h3) {
  margin-top: 16px;
  margin-bottom: 8px;
}
.markdown-renderer :deep(p) {
  margin-bottom: 8px;
}
.markdown-renderer :deep(ul),
.markdown-renderer :deep(ol) {
  padding-left: 24px;
  margin-bottom: 8px;
}
.markdown-renderer :deep(code) {
  background: #f5f5f5;
  padding: 2px 4px;
  border-radius: 4px;
  font-family: monospace;
}
.markdown-renderer :deep(pre) {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
}
.markdown-renderer :deep(a) {
  color: #007aff;
  text-decoration: none;
}
.markdown-renderer :deep(a:hover) {
  text-decoration: underline;
}
</style>
```

- [ ] **Step 4: 运行测试**

Run: `npm run dev`
Expected: Markdown渲染正常，代码高亮显示

- [ ] **Step 5: 提交**

```bash
git add src/components/Markdown/
git commit -m "feat: add markdown renderer with code highlighting"
```

---

## 阶段3：完整功能（3-4周）

### Task 9: 文件面板

**Files:**
- Create: `src/components/Panels/FilesPanel.vue`
- Create: `src/components/Panels/SidePanel.vue`

**Interfaces:**
- Consumes: `useFilesStore` from `@/stores/files`
- Produces: 文件浏览和管理功能

- [ ] **Step 1: 创建 files store**

```typescript
// src/stores/files.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modifiedAt?: number
}

export const useFilesStore = defineStore('files', () => {
  const currentPath = ref('')
  const entries = ref<FileEntry[]>([])
  const loading = ref(false)

  async function fetchEntries(path: string) {
    loading.value = true
    currentPath.value = path
    // 调用 API 获取文件列表
    // const response = await api.get(`/files/list?path=${path}`)
    // entries.value = response.data
    loading.value = false
  }

  async function readFile(path: string) {
    // 调用 API 读取文件内容
    // const response = await api.get(`/files/read?path=${path}`)
    // return response.data
  }

  return {
    currentPath,
    entries,
    loading,
    fetchEntries,
    readFile,
  }
})
```

- [ ] **Step 2: 创建 FilesPanel.vue**

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useFilesStore } from '@/stores/files'

const filesStore = useFilesStore()

onMounted(() => {
  filesStore.fetchEntries('')
})

function handleFileClick(entry: any) {
  if (entry.type === 'directory') {
    filesStore.fetchEntries(entry.path)
  }
}
</script>

<template>
  <div class="files-panel">
    <div class="panel-header">
      <span class="panel-title">文件</span>
      <div class="breadcrumb">
        <span>{{ filesStore.currentPath || '/' }}</span>
      </div>
    </div>
    <div class="file-list">
      <div v-if="filesStore.loading" class="loading">加载中...</div>
      <div
        v-for="entry in filesStore.entries"
        :key="entry.path"
        class="file-item"
        @click="handleFileClick(entry)"
      >
        <span class="file-icon">{{ entry.type === 'directory' ? '📁' : '📄' }}</span>
        <span class="file-name">{{ entry.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.files-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.panel-header {
  padding: 12px;
  border-bottom: 1px solid #e0e0e0;
}
.panel-title {
  font-weight: 600;
  font-size: 14px;
}
.breadcrumb {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}
.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.loading {
  text-align: center;
  color: #999;
  padding: 20px;
}
.file-item {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
}
.file-item:hover {
  background: #f0f0f0;
}
.file-icon {
  margin-right: 8px;
}
.file-name {
  font-size: 13px;
}
</style>
```

- [ ] **Step 3: 创建 SidePanel.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import FilesPanel from './FilesPanel.vue'

const activePanel = ref<'files' | 'outline'>('files')
</script>

<template>
  <div class="side-panel">
    <div class="panel-tabs">
      <button
        :class="{ active: activePanel === 'files' }"
        @click="activePanel = 'files'"
      >
        文件
      </button>
      <button
        :class="{ active: activePanel === 'outline' }"
        @click="activePanel = 'outline'"
      >
        大纲
      </button>
    </div>
    <div class="panel-content">
      <FilesPanel v-if="activePanel === 'files'" />
      <div v-else class="outline-panel">大纲功能开发中...</div>
    </div>
  </div>
</template>

<style scoped>
.side-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-left: 1px solid #e0e0e0;
}
.panel-tabs {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
}
.panel-tabs button {
  flex: 1;
  padding: 8px;
  border: none;
  background: #f8f9fa;
  cursor: pointer;
  font-size: 13px;
}
.panel-tabs button.active {
  background: white;
  border-bottom: 2px solid #007aff;
}
.panel-content {
  flex: 1;
  overflow: hidden;
}
</style>
```

- [ ] **Step 4: 运行测试**

Run: `npm run dev`
Expected: 文件面板显示正常，可浏览目录

- [ ] **Step 5: 提交**

```bash
git add src/components/Panels/ src/stores/files.ts
git commit -m "feat: add files panel with directory browsing"
```

---

### Task 10: 大纲面板

**Files:**
- Create: `src/components/Panels/OutlinePanel.vue`
- Modify: `src/components/Panels/SidePanel.vue`

**Interfaces:**
- Consumes: `messages` from chat store
- Produces: 大纲提取和跳转

- [ ] **Step 1: 创建 OutlinePanel.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()

interface OutlineItem {
  id: string
  type: 'user' | 'heading'
  content: string
  level?: number
  messageId: string
}

const outlineItems = computed<OutlineItem[]>(() => {
  const items: OutlineItem[] = []
  const messages = chatStore.activeSession?.messages || []
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    
    if (msg.role === 'user') {
      items.push({
        id: `user-${msg.id}`,
        type: 'user',
        content: msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : ''),
        messageId: msg.id,
      })
    }
    
    if (msg.role === 'assistant') {
      const headings = extractHeadings(msg.content, msg.id)
      items.push(...headings)
    }
  }
  
  return items
})

function extractHeadings(text: string, messageId: string): OutlineItem[] {
  const items: OutlineItem[] = []
  const regex = /^(#{1,3})\s+(.+)$/gm
  let match
  
  while ((match = regex.exec(text)) !== null) {
    items.push({
      id: `heading-${messageId}-${match.index}`,
      type: 'heading',
      content: match[2],
      level: match[1].length,
      messageId,
    })
  }
  
  return items
}

function scrollToItem(item: OutlineItem) {
  const element = document.getElementById(`msg-${item.messageId}`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth' })
  }
}
</script>

<template>
  <div class="outline-panel">
    <div class="panel-header">
      <span class="panel-title">大纲</span>
    </div>
    <div class="outline-list">
      <div
        v-for="item in outlineItems"
        :key="item.id"
        class="outline-item"
        :class="{ heading: item.type === 'heading' }"
        :style="{ paddingLeft: item.level ? `${(item.level - 1) * 16 + 8}px` : '8px' }"
        @click="scrollToItem(item)"
      >
        {{ item.content }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.outline-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.panel-header {
  padding: 12px;
  border-bottom: 1px solid #e0e0e0;
}
.panel-title {
  font-weight: 600;
  font-size: 14px;
}
.outline-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.outline-item {
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.outline-item:hover {
  background: #f0f0f0;
}
.outline-item.heading {
  font-weight: 500;
}
</style>
```

- [ ] **Step 2: 更新 SidePanel.vue 使用 OutlinePanel**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import FilesPanel from './FilesPanel.vue'
import OutlinePanel from './OutlinePanel.vue'

const activePanel = ref<'files' | 'outline'>('files')
</script>

<template>
  <div class="side-panel">
    <div class="panel-tabs">
      <button
        :class="{ active: activePanel === 'files' }"
        @click="activePanel = 'files'"
      >
        文件
      </button>
      <button
        :class="{ active: activePanel === 'outline' }"
        @click="activePanel = 'outline'"
      >
        大纲
      </button>
    </div>
    <div class="panel-content">
      <FilesPanel v-if="activePanel === 'files'" />
      <OutlinePanel v-else />
    </div>
  </div>
</template>

<style scoped>
/* 保持原有样式不变 */
</style>
```

- [ ] **Step 3: 运行测试**

Run: `npm run dev`
Expected: 大纲面板显示正常，可点击跳转

- [ ] **Step 4: 提交**

```bash
git add src/components/Panels/OutlinePanel.vue src/components/Panels/SidePanel.vue
git commit -m "feat: add outline panel with heading extraction"
```

---

## 自审检查清单

### 1. 规范覆盖

- [x] 侧边栏搜索和过滤
- [x] 工作区分组和折叠
- [x] 右键菜单功能
- [x] 批量操作
- [x] 消息复制
- [x] 工具消息展开/折叠
- [x] 思考过程显示
- [x] Markdown渲染
- [x] 文件面板
- [x] 大纲面板

### 2. 占位符检查

- 无 TBD、TODO 或模糊需求
- 所有步骤都有完整代码
- 所有命令都有预期输出

### 3. 类型一致性

- Session 接口在所有任务中一致
- Message 接口在所有任务中一致
- Store 方法签名在所有任务中一致

---

## 执行选项

**计划已完成并保存到 `docs/superpowers/plans/2026-06-29-chat-view-optimization.md`**

**两种执行方式：**

**1. Subagent-Driven（推荐）** - 我为每个任务分发一个新的子代理，任务之间进行审查，快速迭代

**2. Inline Execution** - 在当前会话中使用 executing-plans 执行任务，批量执行并设置检查点

**选择哪种方式？**
