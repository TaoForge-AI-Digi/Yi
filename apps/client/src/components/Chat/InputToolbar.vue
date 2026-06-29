<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import ModelSelector from './ModelSelector.vue'
import CharacterSelector from './CharacterSelector.vue'

const { t } = useI18n()
const chatStore = useChatStore()

const session = computed(() => chatStore.activeSession)
const fileInput = ref<HTMLInputElement>()

function onWorkspaceChange(e: Event) {
  const s = session.value
  if (s) s.workspace = (e.target as HTMLSelectElement).value
}
function toggleThinking() {
  const s = session.value
  if (s) {
    s.thinking = !s.thinking
    if (!s.thinking) s.reasoning_effort = undefined
  }
}
function onReasoningEffortChange(e: Event) {
  const s = session.value
  if (s) s.reasoning_effort = (e.target as HTMLSelectElement).value || undefined
}
function triggerFilePicker() { fileInput.value?.click() }
function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return
  for (const file of Array.from(files)) {
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => chatStore.addAttachment(file.name, reader.result as string, 'image')
      reader.readAsDataURL(file)
    } else {
      const reader = new FileReader()
      reader.onload = () => chatStore.addAttachment(file.name, reader.result as string, 'text')
      reader.readAsText(file)
    }
  }
  input.value = ''
}
</script>

<template>
  <div v-if="session" class="input-toolbar">
    <div class="toolbar-left">
      <CharacterSelector />
      <ModelSelector />
      <label class="toolbar-item workspace">
        <span class="label">{{ t('chat.workspace') }}</span>
        <input type="text" :value="session.workspace || ''" @change="onWorkspaceChange" :placeholder="`/${t('chat.workspace').toLowerCase()}/project`" />
      </label>
      <button class="attach-btn" @click="triggerFilePicker" title="Attach files">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>
      <input ref="fileInput" type="file" multiple hidden @change="onFilePicked" />
      <div v-if="chatStore.attachments.length > 0" class="attach-chips">
        <span v-for="(a, i) in chatStore.attachments" :key="i" class="attach-chip">
          <img v-if="a.type === 'image'" :src="a.content" class="attach-chip-thumb" />
          <span class="attach-chip-name">{{ a.name }}</span>
          <span class="attach-chip-remove" @click="chatStore.removeAttachment(i)">&times;</span>
        </span>
      </div>
    </div>
    <div class="toolbar-right">
      <button class="thinking-toggle" :class="{ active: session.thinking }" @click="toggleThinking">
        🧠 {{ t('chat.thinking') }}
      </button>
      <label v-if="session.thinking" class="toolbar-item">
        <span class="label">{{ t('chat.reasoningEffort') }}</span>
        <select :value="session.reasoning_effort || ''" @change="onReasoningEffortChange">
          <option value="">{{ t('chat.default') }}</option>
          <option value="low">低</option>
          <option value="medium">中</option>
          <option value="high">高</option>
          <option value="max">最高</option>
        </select>
      </label>
    </div>
  </div>
</template>

<style scoped>
.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
  gap: 8px;
  flex-wrap: wrap;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.toolbar-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #666;
}
.toolbar-item .label {
  white-space: nowrap;
}
.toolbar-item select,
.toolbar-item input {
  font-size: 12px;
  padding: 3px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  max-width: 140px;
}
.toolbar-item.workspace input {
  min-width: 120px;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.thinking-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}
.thinking-toggle.active {
  background: #e8f4ff;
  border-color: #007aff;
  color: #007aff;
}

.attach-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  color: #888;
  flex-shrink: 0;
}
.attach-btn:hover { color: #1976d2; border-color: #1976d2; }

.attach-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px 1px 3px;
  font-size: 11px;
  background: #e3f2fd;
  color: #1976d2;
  border-radius: 10px;
}
.attach-chip-thumb {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}
.attach-chip-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attach-chip-remove {
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  color: #888;
  flex-shrink: 0;
  margin-left: 2px;
}
.attach-chip-remove:hover { color: #d32f2f; }
</style>
