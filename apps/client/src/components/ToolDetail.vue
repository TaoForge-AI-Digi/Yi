<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  toolName: string
  toolInput?: string
  toolOutput?: string
  status: string
}>()

const expanded = ref(false)
</script>

<template>
  <div class="tool-detail">
    <div class="tool-header" @click="expanded = !expanded">
      <span class="tool-name">🛠 {{ toolName }}</span>
      <span class="status-badge" :class="status">{{ status }}</span>
      <span class="expand-icon">{{ expanded ? '▼' : '▶' }}</span>
    </div>
    <div v-if="expanded" class="tool-content">
      <div v-if="toolInput" class="tool-section">
        <div class="section-title">输入:</div>
        <pre class="tool-data">{{ toolInput }}</pre>
      </div>
      <div v-if="toolOutput" class="tool-section">
        <div class="section-title">输出:</div>
        <pre class="tool-data output">{{ toolOutput }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tool-detail {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  margin-top: 8px;
}
.tool-header {
  display: flex;
  align-items: center;
  padding: 8px;
  cursor: pointer;
  background: #f8f9fa;
  border-radius: 8px 8px 0 0;
}
.tool-name {
  font-weight: 600;
  font-size: 13px;
}
.status-badge {
  margin-left: 8px;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.status-badge.running {
  background: #fff3cd;
  color: #856404;
}
.status-badge.completed {
  background: #d4edda;
  color: #155724;
}
.status-badge.done {
  background: #d4edda;
  color: #155724;
}
.status-badge.success {
  background: #d4edda;
  color: #155724;
}
.status-badge.error {
  background: #f8d7da;
  color: #721c24;
}
.status-badge.denied {
  background: #fff3cd;
  color: #856404;
}
.expand-icon {
  margin-left: auto;
  font-size: 10px;
}
.tool-content {
  padding: 8px;
}
.tool-section {
  margin-bottom: 8px;
}
.section-title {
  font-weight: 600;
  font-size: 12px;
  margin-bottom: 4px;
}
.tool-data {
  background: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
}
.tool-data.output {
  background: #e8f5e9;
}
</style>
