<script setup lang="ts">
import { ref } from 'vue'
import SettingsModal from './SettingsModal.vue'

const showSettings = ref(false)
</script>

<template>
  <div class="settings-btn-area">
    <button class="settings-btn" @click="showSettings = true">⚙️ Settings</button>
    <SettingsModal v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.settings-btn-area { padding: 8px; border-top: 1px solid #e0e0e0; }
.settings-btn { width: 100%; padding: 6px; background: none; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; font-size: 13px; }
.settings-btn:hover { background: #e9ecef; }
</style>
