<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'
import InputToolbar from './Chat/InputToolbar.vue'

const chatStore = useChatStore()
const text = ref('')
const sending = ref(false)
const textareaRef = ref<HTMLTextAreaElement>()

async function handleSend() {
  const input = text.value.trim()
  if (!input || sending.value) return
  sending.value = true
  text.value = ''
  resetHeight()
  chatStore.sendMessage(input)
  setTimeout(() => { sending.value = false }, 500)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
}

let dragStartY = 0
let dragStartHeight = 0

function onResizeStart(e: MouseEvent) {
  e.preventDefault()
  const el = textareaRef.value
  if (!el) return
  dragStartY = e.clientY
  dragStartHeight = el.offsetHeight
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(e: MouseEvent) {
  const el = textareaRef.value
  if (!el) return
  const dh = dragStartY - e.clientY
  el.style.height = Math.max(40, Math.min(dragStartHeight + dh, 300)) + 'px'
  el.style.resize = 'none'
}

function onResizeEnd() {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

function autoResize() {
  const el = textareaRef.value
  if (el && el.style.resize !== 'none') {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 300) + 'px'
  }
}

function resetHeight() {
  const el = textareaRef.value
  if (el) {
    el.style.height = ''
    el.style.resize = ''
  }
}
</script>

<template>
  <div class="chat-input-area">
    <InputToolbar />
    <div class="input-row">
      <div class="textarea-wrap">
        <textarea
          ref="textareaRef"
          v-model="text"
          placeholder="Type a message... (Shift+Enter for new line)"
          rows="1"
          @keydown="onKeydown"
          @input="autoResize"
        />
        <div class="resize-handle" @mousedown="onResizeStart">⋮</div>
      </div>
      <div class="actions">
        <button v-if="chatStore.isStreaming" class="btn abort" @click="chatStore.abortRun()">■ Stop</button>
        <button v-else class="btn send" @click="handleSend" :disabled="!text.trim() || sending">发送</button>
      </div>
    </div>
    <div class="input-hint">Enter 发送 · Shift+Enter 换行</div>
  </div>
</template>

<style scoped>
.chat-input-area { border-top: 1px solid #e0e0e0; }
.input-row { display: flex; gap: 8px; padding: 8px 12px 4px; align-items: flex-end; }
.textarea-wrap { flex: 1; position: relative; }
textarea {
  width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 8px;
  font-size: 14px; resize: none; font-family: inherit; line-height: 1.4;
  min-height: 40px; max-height: 300px; box-sizing: border-box;
}
textarea:focus { outline: none; border-color: #007aff; }
.resize-handle {
  position: absolute; top: 2px; right: 6px;
  cursor: n-resize; font-size: 16px; color: #bbb; line-height: 1;
  user-select: none;
}
.resize-handle:hover { color: #666; }
.actions { display: flex; gap: 4px; }
.btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; white-space: nowrap; }
.btn.send { background: #007aff; color: white; }
.btn.send:disabled { opacity: 0.5; cursor: default; }
.btn.abort { background: #ff3b30; color: white; }
.input-hint { padding: 0 12px 6px; font-size: 11px; color: #aaa; text-align: right; }
</style>
