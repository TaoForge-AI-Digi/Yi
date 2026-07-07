<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import MessageItem from './MessageItem.vue'

const chatStore = useChatStore()
const listRef = ref<HTMLDivElement>()

watch(() => chatStore.activeSession?.messages.length, async () => {
  await nextTick()
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
})
</script>

<template>
  <div ref="listRef" class="message-list">
    <div v-if="!chatStore.activeSession" class="empty">Select a session</div>
    <MessageItem v-for="msg in chatStore.activeSession?.messages" :key="msg.id" :message="msg" />
  </div>
</template>

<style scoped>
.message-list { flex: 1; overflow-y: auto; padding: 16px; }
.empty { text-align: center; color: #999; margin-top: 40px; }
</style>
