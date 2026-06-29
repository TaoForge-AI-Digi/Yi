<script setup lang="ts">
defineProps<{ approval: { tool_name: string; description: string } }>()
const emit = defineEmits<{ allow: []; deny: [] }>()
</script>

<template>
  <div class="approval-overlay">
    <div class="approval-dialog">
      <div class="approval-title">Approve Tool: {{ approval.tool_name }}</div>
      <pre class="approval-detail">{{ approval.description }}</pre>
      <div class="approval-actions">
        <button class="btn deny" @click="emit('deny')">Deny</button>
        <button class="btn allow" @click="emit('allow')">Allow</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.approval-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 80px; z-index: 100; }
.approval-dialog { background: white; border-radius: 12px; padding: 20px; min-width: 400px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.approval-title { font-weight: 600; font-size: 16px; margin-bottom: 8px; }
.approval-detail { background: #f5f5f5; padding: 12px; border-radius: 8px; font-size: 13px; max-height: 200px; overflow: auto; margin-bottom: 16px; }
.approval-actions { display: flex; gap: 8px; justify-content: flex-end; }
.btn { padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
.allow { background: #007aff; color: white; }
.deny { background: #e0e0e0; color: #333; }
</style>
