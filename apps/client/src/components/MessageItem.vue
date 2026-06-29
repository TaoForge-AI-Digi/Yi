<script setup lang="ts">
import CopyButton from './CopyButton.vue'
import ToolDetail from './ToolDetail.vue'
import ThinkingBlock from './ThinkingBlock.vue'

defineProps<{ message: import('@/stores/chat').Message }>()
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
      <div v-else class="text-content">
        <span v-if="message.is_streaming && !message.content" class="cursor-blink">▋</span>
        <span style="white-space: pre-wrap">{{ message.content }}</span>
        <span v-if="message.is_streaming && message.content" class="cursor-blink">▋</span>
      </div>
      <div v-if="message.role !== 'tool' && !message.is_streaming" class="message-actions">
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
.message-actions { margin-top: 8px; display: flex; gap: 8px; }
</style>
