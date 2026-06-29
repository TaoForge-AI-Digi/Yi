<script setup lang="ts">
import { ref } from 'vue'
import ContextMenu from './ContextMenu.vue'
import { useChatStore } from '@/stores/chat'

const props = defineProps<{
  session: {
    id: string
    title: string
    pinned?: boolean
  }
  active: boolean
}>()

const emit = defineEmits<{
  click: []
  contextmenu: [event: MouseEvent]
}>()

const chatStore = useChatStore()
const showContextMenu = ref(false)
const contextMenuPos = ref({ x: 0, y: 0 })

function handleContextMenu(event: MouseEvent) {
  contextMenuPos.value = { x: event.clientX, y: event.clientY }
  showContextMenu.value = true
  emit('contextmenu', event)
}

function handleContextAction(action: string) {
  switch (action) {
    case 'delete':
      chatStore.deleteSingleSession(props.session.id)
      break
    case 'pin':
      chatStore.toggleSessionStar(props.session.id)
      break
    case 'rename':
      {
        const title = window.prompt('重命名会话', props.session.title)
        if (title && title !== props.session.title) {
          chatStore.renameSession(props.session.id, title)
        }
      }
      break
    case 'copy-id':
      navigator.clipboard.writeText(props.session.id)
      break
    case 'export':
      exportSession()
      break
  }
}

function exportSession() {
  const session = chatStore.sessions.find(s => s.id === props.session.id)
  if (!session) return
  const blob = new Blob([JSON.stringify({ id: session.id, title: session.title, messages: session.messages, workspace: session.workspace, model: session.model }, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${session.title || 'session'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function toggleStar(event: MouseEvent) {
  event.stopPropagation()
  chatStore.toggleSessionStar(props.session.id)
}
</script>

<template>
  <div
    class="session-item"
    :class="{ active, selected: chatStore.selectedSessionIds.has(session.id), 'batch-mode': chatStore.isBatchMode }"
    @click="chatStore.isBatchMode ? chatStore.toggleSessionSelection(session.id) : emit('click')"
    @contextmenu.prevent="handleContextMenu"
  >
    <input
      v-if="chatStore.isBatchMode"
      type="checkbox"
      class="session-checkbox"
      :checked="chatStore.selectedSessionIds.has(session.id)"
      @click.stop="chatStore.toggleSessionSelection(session.id)"
    />
    <span class="star-btn" :class="{ starred: session.pinned }" @click="toggleStar">
      {{ session.pinned ? '⭐' : '☆' }}
    </span>
    <span class="session-title">{{ session.title || '新建对话' }}</span>
  </div>

  <ContextMenu
    :visible="showContextMenu"
    :x="contextMenuPos.x"
    :y="contextMenuPos.y"
    :session-id="session.id"
    :pinned="session.pinned ?? false"
    @close="showContextMenu = false"
    @action="handleContextAction"
  />
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
.session-item.selected {
  background: #cce5ff;
}
.session-item.batch-mode {
  user-select: none;
}
.session-checkbox {
  margin-right: 6px;
  cursor: pointer;
}
.star-btn {
  margin-right: 6px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  user-select: none;
}
.star-btn.starred {
  font-size: 14px;
}
.session-title {
  flex: 1;
}
</style>
