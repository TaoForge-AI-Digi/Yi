<script setup lang="ts">
import SessionList from './SessionList.vue'
import SettingsBtn from './SettingsBtn.vue'
</script>

<template>
  <aside class="sidebar">
    <SessionList />
    <SettingsBtn />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px; min-width: 260px;
  display: flex; flex-direction: column;
  border-right: 1px solid #e0e0e0;
  background: #f8f9fa;
}
</style>
