<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import CopyButton from './CopyButton.vue'
import ToolDetail from './ToolDetail.vue'
import ThinkingBlock from './ThinkingBlock.vue'
import MarkdownRenderer from './Markdown/MarkdownRenderer.vue'

const props = defineProps<{ message: import('@/stores/chat').Message }>()
const chatStore = useChatStore()

const editing = ref(false)
const editText = ref('')

function startEdit() {
  editText.value = props.message.content
  editing.value = true
}
function saveEdit() {
  const s = chatStore.activeSession
  if (s && editText.value.trim()) {
    chatStore.updateMessage(s.id, props.message.id, editText.value)
  }
  editing.value = false
}
function cancelEdit() {
  editing.value = false
}
function remove() {
  const s = chatStore.activeSession
  if (s) chatStore.deleteMessage(s.id, props.message.id)
}
</script>

<template>
  <div :id="`msg-${message.id}`" class="message" :class="message.role">
    <div class="bubble">
      <ThinkingBlock
        v-if="message.reasoning"
        :content="message.reasoning"
        :duration="message.reasoning_duration"
      />
      <div v-if="message.role === 'tool'" class="tool-message">
        <ToolDetail
          :tool-name="message.tool_name || ''"
          :tool-input="message.tool_input"
          :tool-output="message.tool_output"
          :status="message.tool_status || 'running'"
        />
      </div>
      <div v-else-if="editing" class="edit-area">
        <textarea v-model="editText" class="edit-input" @keydown.enter.ctrl="saveEdit" />
        <div class="edit-actions">
          <button class="edit-btn save" @click="saveEdit">保存</button>
          <button class="edit-btn cancel" @click="cancelEdit">取消</button>
        </div>
      </div>
      <div v-else class="text-content">
        <span v-if="message.is_streaming && !message.content" class="cursor-blink">▋</span>
        <MarkdownRenderer v-if="message.role === 'assistant'" :content="message.content" />
        <span v-else style="white-space: pre-wrap">{{ message.content }}</span>
        <span v-if="message.is_streaming && message.content" class="cursor-blink">▋</span>
      </div>
      <div v-if="message.role !== 'tool' && !message.is_streaming" class="message-footer">
        <span class="timestamp">{{ new Date(message.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }}</span>
        <button v-if="message.role === 'user'" class="action-btn" @click="startEdit" title="编辑">✏️</button>
        <button class="action-btn" @click="remove" title="删除">🗑️</button>
        <CopyButton :text="message.content" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.message { margin-bottom: 12px; display: flex; }
.message.user { justify-content: flex-end; }
.message.assistant .bubble { background: #f0f0f0; }
.message.user .bubble { background: #007aff; color: white; }
.bubble { max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 14px; line-height: 1.5; }
.tool-message { width: 100%; }
.cursor-blink { animation: blink 1s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
.message-footer { margin-top: 6px; display: flex; align-items: center; gap: 6px; }
.message-footer .timestamp { font-size: 11px; color: #999; }
.message.user .message-footer .timestamp { color: rgba(255,255,255,0.7); }
.action-btn { background: none; border: none; cursor: pointer; padding: 0; font-size: 13px; line-height: 1; opacity: 0.5; }
.action-btn:hover { opacity: 1; }
.edit-area { width: 100%; }
.edit-input { width: 100%; min-height: 60px; padding: 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; font-family: inherit; resize: vertical; }
.edit-input:focus { outline: none; border-color: #007aff; }
.edit-actions { display: flex; gap: 6px; margin-top: 6px; }
.edit-btn { padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
.edit-btn.save { background: #007aff; color: white; }
.edit-btn.cancel { background: #e0e0e0; }
</style>
