<script setup lang="ts">
defineProps<{ message: import('@/stores/chat').Message }>()
</script>

<template>
  <div class="message" :class="message.role">
    <div class="bubble">
      <div v-if="message.role === 'tool'" class="tool-card">
        <span class="tool-name">🛠 {{ message.tool_name }}</span>
        <span v-if="message.tool_status === 'running'" class="badge running">running...</span>
        <pre v-if="message.tool_input" class="tool-detail">{{ message.tool_input }}</pre>
        <pre v-if="message.tool_output" class="tool-detail output">{{ message.tool_output }}</pre>
      </div>
      <div v-else class="text-content">
        <span v-if="message.is_streaming && !message.content" class="cursor-blink">▋</span>
        <span style="white-space: pre-wrap">{{ message.content }}</span>
        <span v-if="message.is_streaming && message.content" class="cursor-blink">▋</span>
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
.tool-card { font-size: 13px; }
.tool-name { font-weight: 600; }
.badge.running { color: #666; font-size: 12px; margin-left: 8px; }
.tool-detail { background: #f5f5f5; padding: 8px; border-radius: 6px; margin-top: 6px; font-size: 12px; overflow-x: auto; }
.tool-detail.output { background: #e8f5e9; }
.cursor-blink { animation: blink 1s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
</style>
