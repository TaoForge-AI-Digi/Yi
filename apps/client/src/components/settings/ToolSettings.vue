<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToolsStore } from '@/stores/tools'
import * as api from '@/api/tools'

const { t } = useI18n()
const store = useToolsStore()

const showImportModal = ref(false)
const importJson = ref('')
const importError = ref('')

const editingMCP = ref<{
  id?: string
  name: string
  command: string
  args: string
  env: string
} | null>(null)

function newMCP() {
  editingMCP.value = { name: '', command: '', args: '', env: '' }
}

function editMCP(s: api.MCPServer) {
  editingMCP.value = {
    id: s.id,
    name: s.name,
    command: s.command,
    args: (s.args || []).join(' '),
    env: Object.entries(s.env || {}).map(([k, v]) => `${k}=${v}`).join('\n'),
  }
}

function cancelEdit() {
  editingMCP.value = null
}

async function saveMCP() {
  if (!editingMCP.value) return
  const e = editingMCP.value
  const args = e.args ? e.args.split(/\s+/).filter(Boolean) : []
  const env: Record<string, string> = {}
  for (const line of e.env.split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  const data = { name: e.name, command: e.command, args, env }
  if (e.id) {
    await store.updateMCP(e.id, data)
  } else {
    await store.createMCP(data)
  }
  editingMCP.value = null
}

async function removeMCP(id: string) {
  if (confirm(t('toolSetting.deleteConfirm'))) await store.removeMCP(id)
}

function openImport() {
  importJson.value = ''
  importError.value = ''
  showImportModal.value = true
}

async function doImport() {
  importError.value = ''
  try {
    const data = JSON.parse(importJson.value)
    if (!data.command) { importError.value = t('toolSetting.importMissingCommand'); return }
    await store.createMCP({
      name: data.name || data.command,
      command: data.command,
      args: data.args || [],
      env: data.env || {},
    })
    showImportModal.value = false
  } catch {
    importError.value = t('toolSetting.importInvalidJson')
  }
}

onMounted(() => { store.load() })
</script>

<template>
  <section class="settings-section">
    <h3 class="section-title">{{ t('toolSetting.title') }}</h3>

    <div class="ts-split">
      <div class="ts-panel ts-panel-left">
        <div class="ts-panel-header">
          <h4 class="ts-panel-title">{{ t('toolSetting.builtinSection') }}</h4>
        </div>
        <div class="tool-grid">
          <div v-for="tool in store.allTools" :key="tool.name" class="tool-card">
            <div class="tool-card-header">
              <span class="tool-name">{{ tool.name }}</span>
              <span :class="['tool-source-tag', `tool-source-tag--${tool.source}`]">
                {{ tool.source === 'builtin' ? '内置' : tool.source === 'mcp' ? 'MCP' : '外部导入' }}
              </span>
            </div>
            <p class="tool-desc">{{ tool.description }}</p>
          </div>
        </div>
      </div>

      <div class="ts-divider" />

      <div class="ts-panel ts-panel-right">
        <div class="ts-panel-header">
          <h4 class="ts-panel-title">{{ t('toolSetting.mcpSection') }}</h4>
          <div class="ts-panel-actions">
            <button class="btn-import" @click="openImport">{{ t('toolSetting.importBtn') }}</button>
            <button class="btn-add-mcp" @click="newMCP">{{ t('toolSetting.addMCP') }}</button>
          </div>
        </div>

        <div v-if="store.mcpServers.length === 0" class="mcp-empty">
          {{ t('toolSetting.noMCP') }}
        </div>

        <div v-for="s in store.mcpServers" :key="s.id" class="mcp-card">
          <div class="mcp-card-header">
            <div class="mcp-card-info">
              <span class="mcp-name">{{ s.name }}</span>
              <span class="mcp-command">{{ s.command }} {{ s.args?.join(' ') }}</span>
            </div>
          </div>
          <div v-if="s.env && Object.keys(s.env).length > 0" class="mcp-env">
            <span v-for="(v, k) in s.env" :key="k" class="mcp-env-item">{{ k }}={{ v }}</span>
          </div>
          <div class="mcp-actions">
            <button class="btn-sm" @click="editMCP(s)">{{ t('toolSetting.edit') }}</button>
            <button class="btn-sm btn-sm-danger" @click="removeMCP(s.id)">{{ t('toolSetting.delete') }}</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showImportModal" class="edit-form-overlay" @click.self="showImportModal = false">
      <div class="edit-form">
        <h4 class="form-title">{{ t('toolSetting.importTitle') }}</h4>
        <p class="form-desc">{{ t('toolSetting.importDesc') }}</p>
        <div class="form-group">
          <textarea v-model="importJson" :placeholder="t('toolSetting.importPlaceholder')" rows="8" />
        </div>
        <p v-if="importError" class="import-error">{{ importError }}</p>
        <div class="form-actions">
          <button class="btn-primary" @click="doImport">{{ t('toolSetting.importConfirm') }}</button>
          <button class="btn-cancel" @click="showImportModal = false">{{ t('toolSetting.cancel') }}</button>
        </div>
      </div>
    </div>

    <div v-if="editingMCP" class="edit-form-overlay" @click.self="cancelEdit">
      <div class="edit-form">
        <h4 class="form-title">{{ editingMCP.id ? t('toolSetting.editMCPSection') : t('toolSetting.newMCPSection') }}</h4>
        <div class="form-group">
          <label>{{ t('toolSetting.nameLabel') }}</label>
          <input v-model="editingMCP.name" :placeholder="t('toolSetting.namePlaceholder')" />
        </div>
        <div class="form-group">
          <label>{{ t('toolSetting.commandLabel') }}</label>
          <input v-model="editingMCP.command" :placeholder="t('toolSetting.commandPlaceholder')" />
        </div>
        <div class="form-group">
          <label>{{ t('toolSetting.argsLabel') }}</label>
          <input v-model="editingMCP.args" :placeholder="t('toolSetting.argsPlaceholder')" />
        </div>
        <div class="form-group">
          <label>{{ t('toolSetting.envLabel') }}</label>
          <textarea v-model="editingMCP.env" :placeholder="t('toolSetting.envPlaceholder')" rows="3" />
        </div>
        <div class="form-actions">
          <button class="btn-primary" @click="saveMCP">{{ t('toolSetting.save') }}</button>
          <button class="btn-cancel" @click="cancelEdit">{{ t('toolSetting.cancel') }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-section { height: 100%; display: flex; flex-direction: column; }
.section-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; flex-shrink: 0; }

.ts-split { flex: 1; display: flex; gap: 0; overflow: hidden; min-height: 0; }

.ts-panel {
  flex: 1;
  overflow-y: auto;
  min-width: 0;
}

.ts-panel-left {
  padding-right: 16px;
}

.ts-panel-right {
  padding-left: 16px;
}

.ts-divider {
  width: 1px;
  flex-shrink: 0;
  background: #e0e0e0;
}

.ts-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.ts-panel-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: #333;
}

.ts-panel-actions { display: flex; gap: 8px; }
.btn-import { padding: 5px 14px; border: 1px solid #1976d2; border-radius: 4px; font-size: 12px; background: #fff; color: #1976d2; cursor: pointer; transition: all 0.15s; }
.btn-import:hover { background: #e3f2fd; }
.btn-add-mcp { padding: 5px 14px; border: none; border-radius: 4px; font-size: 12px; background: #1976d2; color: #fff; cursor: pointer; }
.btn-add-mcp:hover { background: #1565c0; }

.tool-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
.tool-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 12px 14px; background: #fafafa; }
.tool-card-header { margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
.tool-name { font-size: 13px; font-weight: 600; color: #333; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.tool-source-tag { font-size: 10px; padding: 1px 6px; border-radius: 3px; font-weight: 500; white-space: nowrap; flex-shrink: 0; }
.tool-source-tag--builtin { background: #e8f5e9; color: #388e3c; }
.tool-source-tag--mcp { background: #e3f2fd; color: #1976d2; }
.tool-source-tag--external { background: #fff3e0; color: #e65100; }
.tool-desc { font-size: 12px; color: #888; margin: 0; line-height: 1.4; }

.mcp-empty { text-align: center; padding: 24px; font-size: 13px; color: #999; border: 1px dashed #ddd; border-radius: 8px; }
.mcp-card { border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px; margin-bottom: 10px; background: #fafafa; }
.mcp-card-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mcp-name { font-size: 14px; font-weight: 600; color: #333; }
.mcp-command { font-size: 12px; color: #888; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mcp-env { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.mcp-env-item { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #e3f2fd; color: #1976d2; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.mcp-actions { display: flex; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; }
.btn-sm { padding: 4px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; background: #fff; cursor: pointer; color: #333; }
.btn-sm:hover { background: #e3f2fd; border-color: #90caf9; }
.btn-sm-danger:hover { background: #fce4ec; border-color: #ef9a9a; color: #d32f2f; }

.form-desc { font-size: 12px; color: #888; margin: -8px 0 12px; }
.import-error { font-size: 12px; color: #d32f2f; margin: 0 0 8px; }

.edit-form-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.3);
  display: flex; align-items: center; justify-content: center; z-index: 200;
}
.edit-form {
  background: #fff; border-radius: 12px; padding: 24px; width: 480px;
  max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.form-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; font-weight: 500; }
.form-group input, .form-group textarea { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; outline: none; font-family: inherit; box-sizing: border-box; }
.form-group input:focus, .form-group textarea:focus { border-color: #1976d2; }
.form-group textarea { resize: vertical; }
.form-actions { display: flex; gap: 8px; margin-top: 16px; }
.btn-primary { padding: 7px 16px; background: #1976d2; color: #fff; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
.btn-primary:hover { background: #1565c0; }
.btn-cancel { padding: 7px 16px; background: #fff; color: #666; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; cursor: pointer; }
.btn-cancel:hover { background: #f5f5f5; }
</style>
