<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useProvidersStore } from '@/stores/providers'
import { useCharactersStore } from '@/stores/characters'
import Sidebar from '@/components/Sidebar.vue'

const route = useRoute()
const providersStore = useProvidersStore()
const charactersStore = useCharactersStore()

const isSettingsRoute = computed(() => route.path.startsWith('/settings'))

onMounted(async () => {
  await Promise.all([
    providersStore.load(),
    charactersStore.load(),
  ])
})
</script>

<template>
  <div class="app-layout">
    <Sidebar v-if="!isSettingsRoute" />
    <router-view />
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { height: 100%; }
.app-layout { display: flex; height: 100%; }
</style>
