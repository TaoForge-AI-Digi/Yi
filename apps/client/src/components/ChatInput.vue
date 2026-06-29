<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
const text = ref('')
const sending = ref(false)

async function handleSend() {
  const input = text.value.trim()
  if (!input || sending.value) return
  sending.value = true
  text.value = ''
  chatStore.sendMessage(input)
  setTimeout(() => { sending.value = false }, 500)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
}
</script>

<template>
  <div class="chat-input-area">
    <div class="input-row">
      <textarea
        v-model="text"
        placeholder="Type a message..."
        rows="3"
        @keydown="onKeydown"
      />
      <div class="actions">
        <button v-if="chatStore.isStreaming" class="btn abort" @click="chatStore.abortRun()">■ Stop</button>
        <button v-else class="btn send" @click="handleSend" :disabled="!text.trim()">Send</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-input-area { border-top: 1px solid #e0e0e0; padding: 12px; }
.input-row { display: flex; gap: 8px; align-items: flex-end; }
textarea { flex: 1; padding: 10px; border: 1px solid #ccc; border-radius: 8px; font-size: 14px; resize: none; font-family: inherit; }
.actions { display: flex; gap: 4px; }
.btn { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
.btn.send { background: #007aff; color: white; }
.btn.send:disabled { opacity: 0.5; cursor: default; }
.btn.abort { background: #ff3b30; color: white; }
</style>
