<script setup lang="ts">
import MessageList from './MessageList.vue'
import ChatInput from './ChatInput.vue'
import ApprovalDialog from './ApprovalDialog.vue'
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()
</script>

<template>
  <main class="chat-area">
    <MessageList />
    <ChatInput />
    <ApprovalDialog
      v-if="chatStore.pendingApproval"
      :approval="chatStore.pendingApproval"
      @allow="chatStore.respondApproval('allow')"
      @deny="chatStore.respondApproval('deny')"
    />
  </main>
</template>

<style scoped>
.chat-area { flex: 1; display: flex; flex-direction: column; min-width: 0; }
</style>
