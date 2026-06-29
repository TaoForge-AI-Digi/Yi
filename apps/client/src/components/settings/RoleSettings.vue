<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCharactersStore } from '@/stores/characters'
import type { CharacterConfig } from '@/api/characters'

const { t } = useI18n()
const store = useCharactersStore()

const searchQuery = ref('')
const selectedId = ref<string | null>(null)
const showForm = ref(false)
const activeTab = ref<'basic' | 'memory' | 'tools' | 'skills' | 'knowledge'>('basic')

const editingSection = ref<'soul' | 'user' | 'memory' | null>(null)
const editContent = ref('')
const isNew = ref(false)

const defaultPermissions = { edit: 'ask' as const, bash: 'ask' as const, webfetch: 'allow' as const }

const form = ref<CharacterConfig>({
  name: '',
  description: '',
  avatar: '',
  color: '#6366f1',
  soul: '',
  userProfile: '',
  memory: { enabled: false, selfEvolution: false, charLimit: 2200 },
  memoryContent: '',
  permissions: { ...defaultPermissions },
  maxSteps: 10,
  mode: 'all',
  enabled: true,
})

const filteredCharacters = computed(() => {
  const q = searchQuery.value.toLowerCase()
  return store.characters.filter(c =>
    !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)
  )
})

function getFormValue(key: 'soul' | 'user' | 'memory'): string {
  if (key === 'soul') return form.value.soul || ''
  if (key === 'user') return form.value.userProfile || ''
  return form.value.memoryContent || ''
}

function select(id: string) {
  selectedId.value = id
  isNew.value = false
  showForm.value = true
  activeTab.value = 'basic'
  const c = store.characters.find(x => x.id === id)
  if (c) {
    form.value = {
      name: c.name,
      description: c.description || '',
      avatar: c.avatar || '',
      color: c.color || '#6366f1',
      soul: c.soul || '',
      userProfile: c.userProfile || '',
      memory: c.memory ? { ...c.memory, charLimit: c.memory.charLimit ?? 2200, selfEvolution: c.memory.selfEvolution ?? false } : { enabled: false, selfEvolution: false, charLimit: 2200 },
      memoryContent: c.memoryContent || '',
      permissions: c.permissions ? { ...c.permissions } : { ...defaultPermissions },
      maxSteps: c.maxSteps ?? 10,
      mode: c.mode || 'all',
      enabled: c.enabled ?? true,
    }
  }
}

function startCreate() {
  selectedId.value = null
  isNew.value = true
  showForm.value = true
  activeTab.value = 'basic'
  form.value = {
    name: '',
    description: '',
    avatar: '',
    color: '#6366f1',
    soul: '',
    userProfile: '',
    memory: { enabled: false, selfEvolution: false, charLimit: 2200 },
    memoryContent: '',
    permissions: { ...defaultPermissions },
    maxSteps: 10,
    mode: 'all',
    enabled: true,
  }
}

async function handleDelete(id: string) {
  await store.remove(id)
  if (selectedId.value === id) {
    selectedId.value = null
    showForm.value = false
  }
}

function handleCancel() {
  showForm.value = false
  selectedId.value = null
  isNew.value = false
}

async function handleSave() {
  if (!form.value.name.trim()) return
  if (isNew.value) {
    const created = await store.create(form.value)
    selectedId.value = created.id
    isNew.value = false
  } else if (selectedId.value) {
    await store.update(selectedId.value, form.value)
  }
  showForm.value = false
}

function handleAvatarUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => { form.value.avatar = e.target?.result as string }
  reader.readAsDataURL(file)
  input.value = ''
}

function removeAvatar() { form.value.avatar = '' }

function startEdit(section: 'soul' | 'user' | 'memory') {
  editingSection.value = section
  if (section === 'soul') editContent.value = form.value.soul || ''
  else if (section === 'user') editContent.value = form.value.userProfile || ''
  else editContent.value = form.value.memoryContent || ''
}

function cancelEdit() { editingSection.value = null; editContent.value = '' }

function saveEdit() {
  if (!editingSection.value) return
  if (editingSection.value === 'soul') form.value.soul = editContent.value
  else if (editingSection.value === 'user') form.value.userProfile = editContent.value
  else form.value.memoryContent = editContent.value
  editingSection.value = null
  editContent.value = ''
}

function setPermission(key: string, value: string) {
  if (!form.value.permissions) form.value.permissions = { ...defaultPermissions }
  ;(form.value.permissions as any)[key] = value
}


</script>

<template>
  <div class="role-settings">
    <div class="role-layout">
      <!-- Left: Character List -->
      <aside class="role-list-panel">
        <div class="role-list-header">
          <span class="role-list-title">{{ t('role.characterList') }}</span>
          <span class="role-count">{{ store.characters.length }}</span>
        </div>
        <div class="role-search">
          <input v-model="searchQuery" class="search-input" :placeholder="t('role.searchPlaceholder')" />
        </div>
        <div class="role-items">
          <button
            v-for="c in filteredCharacters"
            :key="c.id"
            :class="['role-item', { active: selectedId === c.id }]"
            @click="select(c.id)"
          >
            <span class="role-avatar" :style="{ borderColor: c.color || '#999' }">
              <img v-if="c.avatar" :src="c.avatar" class="role-avatar-img" />
              <span v-else class="role-avatar-letter">{{ c.name.charAt(0).toUpperCase() }}</span>
            </span>
            <span class="role-info">
              <span class="role-name">{{ c.name }}</span>
              <span class="role-desc">{{ c.description || '' }}</span>
            </span>
            <span v-if="c.builtIn" class="role-badge">{{ t('role.builtIn') }}</span>
            <span v-else class="role-actions">
              <span class="role-action-btn edit-btn" @click.stop="select(c.id)" :title="t('common.edit')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </span>
              <span class="role-action-btn delete-btn" @click.stop="handleDelete(c.id)" :title="t('common.delete')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </span>
            </span>
          </button>
          <div v-if="filteredCharacters.length === 0" class="role-empty">
            {{ t('role.noCharacters') }}
          </div>
        </div>
        <div class="role-list-footer">
          <button class="create-btn" @click="startCreate">+ {{ t('role.create') }}</button>
        </div>
      </aside>

      <!-- Right: Character Form -->
      <div class="role-detail-panel">
        <div v-if="!showForm" class="role-detail-empty">
          <p>{{ t('role.noSelection') }}</p>
        </div>
        <div v-else class="character-form">
          <!-- Sub Tabs -->
          <div class="sub-tabs">
            <button
              v-for="tab in (isNew ? ['basic'] : ['basic', 'memory', 'tools', 'skills', 'knowledge'])"
              :key="tab"
              :class="['sub-tab', { active: activeTab === tab }]"
              @click="activeTab = tab as any"
            >{{ t(`role.tab.${tab}`) }}</button>
          </div>

          <!-- Basic Tab -->
          <div v-if="activeTab === 'basic'" class="tab-content">
            <div class="form-top">
              <div class="form-left">
                <div class="avatar-preview" :style="{ borderColor: form.color || '#6366f1' }">
                  <img v-if="form.avatar" :src="form.avatar" class="avatar-img" />
                  <span v-else class="avatar-placeholder">{{ form.name?.charAt(0) || '?' }}</span>
                </div>
                <input type="color" v-model="form.color" class="color-picker" />
                <div class="avatar-actions">
                  <label class="avatar-upload-btn">
                    <input type="file" accept="image/*" hidden @change="handleAvatarUpload" />
                    {{ t('role.uploadAvatar') }}
                  </label>
                  <button v-if="form.avatar" class="avatar-remove-btn" @click="removeAvatar">
                    {{ t('role.removeAvatar') }}
                  </button>
                </div>
              </div>
              <div class="form-right">
                <div class="field">
                  <label class="field-label">{{ t('role.name') }}</label>
                  <input v-model="form.name" class="field-input" :placeholder="t('role.namePlaceholder')" />
                </div>
                <div class="field">
                  <label class="field-label">{{ t('role.description') }}</label>
                  <textarea v-model="form.description" class="field-textarea" :rows="2" :placeholder="t('role.descPlaceholder')"></textarea>
                </div>
                <label class="toggle-row">
                  <span class="toggle-label">{{ t('role.enabled') }}</span>
                  <input type="checkbox" v-model="form.enabled" class="toggle-input" />
                  <span class="toggle-switch"></span>
                </label>
                <label class="toggle-row">
                  <span class="toggle-label">{{ t('role.selfEvolution') }}</span>
                  <input type="checkbox" v-model="form.memory!.selfEvolution!" class="toggle-input" />
                  <span class="toggle-switch"></span>
                </label>
              </div>
            </div>

            <!-- Soul -->
            <div class="memory-section" style="margin-top: 16px;">
              <div class="section-header">
                <div class="section-title-row">
                  <span class="section-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    </svg>
                  </span>
                  <span class="section-title">{{ t('role.soul') }}</span>
                </div>
                <div class="section-header-right">
                  <button v-if="editingSection !== 'soul'" class="section-edit-btn" @click="startEdit('soul')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    {{ t('common.edit') }}
                  </button>
                </div>
              </div>
              <div v-if="editingSection !== 'soul'" class="section-body">
                <p v-if="!getFormValue('soul')" class="empty-text">{{ t('role.soulPlaceholder') }}</p>
                <div v-else class="content-text">{{ getFormValue('soul') }}</div>
              </div>
              <div v-else class="section-edit">
                <textarea v-model="editContent" class="edit-textarea" :placeholder="t('role.soulPlaceholder')" spellcheck="false" />
                <div class="edit-actions">
                  <button class="btn btn-sm" @click="cancelEdit">{{ t('common.cancel') }}</button>
                  <button class="btn btn-sm btn-primary" @click="saveEdit">{{ t('common.save') }}</button>
                </div>
              </div>
            </div>

            <!-- User Profile -->
            <div class="memory-section" style="margin-top: 12px;">
              <div class="section-header">
                <div class="section-title-row">
                  <span class="section-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    </svg>
                  </span>
                  <span class="section-title">{{ t('role.userProfile') }}</span>
                </div>
                <div class="section-header-right">
                  <button v-if="editingSection !== 'user'" class="section-edit-btn" @click="startEdit('user')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    {{ t('common.edit') }}
                  </button>
                </div>
              </div>
              <div v-if="editingSection !== 'user'" class="section-body">
                <p v-if="!getFormValue('user')" class="empty-text">{{ t('role.userProfilePlaceholder') }}</p>
                <div v-else class="content-text">{{ getFormValue('user') }}</div>
              </div>
              <div v-else class="section-edit">
                <textarea v-model="editContent" class="edit-textarea" :placeholder="t('role.userProfilePlaceholder')" spellcheck="false" />
                <div class="edit-actions">
                  <button class="btn btn-sm" @click="cancelEdit">{{ t('common.cancel') }}</button>
                  <button class="btn btn-sm btn-primary" @click="saveEdit">{{ t('common.save') }}</button>
                </div>
              </div>
            </div>

          </div>

          <!-- Tools Tab -->
          <div v-if="activeTab === 'tools'" class="tab-content">
            <div class="permissions-section">
              <div class="perm-grid">
                <div class="perm-row">
                  <span class="perm-key">Edit</span>
                  <div class="perm-radio-group">
                    <label v-for="p in ['ask', 'allow', 'deny']" :key="p" :class="['perm-radio', { active: form.permissions?.edit === p }]">
                      <input type="radio" name="perm-edit" :value="p" :checked="form.permissions?.edit === p" @change="setPermission('edit', p)" />
                      <span>{{ p.charAt(0).toUpperCase() + p.slice(1) }}</span>
                    </label>
                  </div>
                  <span class="perm-desc">read / write / edit / grep / glob</span>
                </div>
                <div class="perm-row">
                  <span class="perm-key">Bash</span>
                  <div class="perm-radio-group">
                    <label v-for="p in ['ask', 'allow', 'deny']" :key="p" :class="['perm-radio', { active: form.permissions?.bash === p }]">
                      <input type="radio" name="perm-bash" :value="p" :checked="form.permissions?.bash === p" @change="setPermission('bash', p)" />
                      <span>{{ p.charAt(0).toUpperCase() + p.slice(1) }}</span>
                    </label>
                  </div>
                  <span class="perm-desc">bash / sh</span>
                </div>
                <div class="perm-row">
                  <span class="perm-key">Webfetch</span>
                  <div class="perm-radio-group">
                    <label v-for="p in ['allow', 'deny']" :key="p" :class="['perm-radio', { active: form.permissions?.webfetch === p }]">
                      <input type="radio" name="perm-webfetch" :value="p" :checked="form.permissions?.webfetch === p" @change="setPermission('webfetch', p)" />
                      <span>{{ p.charAt(0).toUpperCase() + p.slice(1) }}</span>
                    </label>
                  </div>
                  <span class="perm-desc">webfetch / websearch</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Memory Tab -->
          <div v-if="activeTab === 'memory'" class="tab-content">
            <div class="memory-section">
              <div class="section-header">
                <div class="section-title-row">
                  <span class="section-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    </svg>
                  </span>
                  <span class="section-title">{{ t('role.memory') }}</span>
                </div>
                <div class="section-header-right">
                  <label class="toggle-sm">
                    <input type="checkbox" v-model="form.memory!.enabled" class="toggle-input" />
                    <span class="toggle-switch"></span>
                  </label>
                </div>
              </div>
              <div v-if="!form.memory?.enabled" class="section-body">
                <p class="empty-text">{{ t('role.memoryDisabledHint') }}</p>
              </div>
              <div v-else class="section-body">
                <label class="toggle-row">
                  <span class="toggle-label">{{ t('role.selfEvolution') }}</span>
                  <input type="checkbox" v-model="form.memory!.selfEvolution!" class="toggle-input" />
                  <span class="toggle-switch"></span>
                </label>
                <div class="field" style="margin-top: 12px;">
                  <label class="field-label">{{ t('role.charLimit') }}</label>
                  <input type="number" v-model.number="form.memory!.charLimit!" class="field-input" min="100" max="10000" />
                </div>
                <div class="memory-section" style="margin-top: 16px;">
                  <div class="section-header">
                    <div class="section-title-row">
                      <span class="section-title">{{ t('role.memoryContent') }}</span>
                    </div>
                    <div class="section-header-right">
                      <button v-if="editingSection !== 'memory'" class="section-edit-btn" @click="startEdit('memory')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        {{ t('common.edit') }}
                      </button>
                    </div>
                  </div>
                  <div v-if="editingSection !== 'memory'" class="section-body">
                    <p v-if="!getFormValue('memory')" class="empty-text">{{ t('role.memoryPlaceholder') }}</p>
                    <div v-else class="content-text">{{ getFormValue('memory') }}</div>
                  </div>
                  <div v-else class="section-edit">
                    <textarea v-model="editContent" class="edit-textarea" :placeholder="t('role.memoryPlaceholder')" spellcheck="false" />
                    <div class="edit-actions">
                      <button class="btn btn-sm" @click="cancelEdit">{{ t('common.cancel') }}</button>
                      <button class="btn btn-sm btn-primary" @click="saveEdit">{{ t('common.save') }}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Skills Tab -->
          <div v-if="activeTab === 'skills'" class="tab-content">
            <div class="placeholder-tab">
              <p>{{ t('role.skillsPlaceholder') }}</p>
            </div>
          </div>

          <!-- Knowledge Tab -->
          <div v-if="activeTab === 'knowledge'" class="tab-content">
            <div class="placeholder-tab">
              <p>{{ t('role.knowledgePlaceholder') }}</p>
            </div>
          </div>

          <!-- Form Actions -->
          <div class="form-actions">
            <button class="btn" @click="handleCancel">{{ t('common.cancel') }}</button>
            <button class="btn btn-primary" @click="handleSave">{{ t('common.save') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.role-settings {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.role-layout {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

/* ── Left: Character List ── */
.role-list-panel {
  width: 280px;
  min-width: 280px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.role-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid #e0e0e0;
  background: #fff;
}

.role-list-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.role-count {
  font-size: 11px;
  color: #fff;
  background: #1976d2;
  border-radius: 10px;
  padding: 1px 7px;
  min-width: 20px;
  text-align: center;
}

.role-search {
  padding: 8px 10px;
  border-bottom: 1px solid #e0e0e0;
}

.search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  background: #fff;
}

.search-input:focus { border-color: #1976d2; }

.role-items {
  flex: 1;
  overflow-y: auto;
}

.role-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  text-align: left;
  border-bottom: 1px solid #f0f0f0;
}

.role-item:last-child { border-bottom: none; }
.role-item:hover { background: #f0f7ff; }
.role-item.active { background: #e3f2fd; }

.role-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #f0f0f0;
  overflow: hidden;
}

.role-avatar-img { width: 100%; height: 100%; object-fit: cover; }
.role-avatar-letter { font-size: 13px; font-weight: 600; color: #666; }

.role-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.role-name { font-size: 13px; font-weight: 500; color: #333; }
.role-desc { font-size: 11px; color: #999; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.role-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: #e3f2fd;
  color: #1976d2;
  flex-shrink: 0;
}

.role-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
}

.role-item:hover .role-actions { opacity: 1; }

.role-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  color: #888;
}

.role-action-btn:hover { background: rgba(0,0,0,0.06); }
.edit-btn:hover { color: #1976d2; }
.delete-btn:hover { color: #d32f2f; }

.role-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 12px;
  color: #999;
}

.role-list-footer {
  padding: 8px 10px;
  border-top: 1px solid #e0e0e0;
}

.create-btn {
  width: 100%;
  padding: 7px;
  border: 1px dashed #bbb;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: #555;
}

.create-btn:hover {
  background: #e3f2fd;
  border-color: #1976d2;
  color: #1976d2;
}

/* ── Right: Detail Panel ── */
.role-detail-panel {
  flex: 1;
  min-width: 0;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background: #fff;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.role-detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  font-size: 14px;
}

/* ── Character Form ── */
.character-form {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Sub Tabs */
.sub-tabs {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
  padding: 0 16px;
  background: #fafafa;
  flex-shrink: 0;
}

.sub-tab {
  padding: 10px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: #888;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s;
}

.sub-tab:hover { color: #333; }
.sub-tab.active {
  color: #1976d2;
  font-weight: 500;
  border-bottom-color: #1976d2;
}

.tab-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

/* ── Basic Tab ── */
.form-top {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.form-left {
  width: 100px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.avatar-preview {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
}

.avatar-img { width: 100%; height: 100%; object-fit: cover; }
.avatar-placeholder { font-size: 28px; font-weight: 600; color: #bbb; }

.color-picker {
  width: 100%;
  height: 28px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1px;
  cursor: pointer;
  background: none;
}

.avatar-actions { display: flex; flex-direction: column; gap: 4px; align-items: center; font-size: 12px; }
.avatar-upload-btn { color: #1976d2; cursor: pointer; text-decoration: underline; }
.avatar-remove-btn { background: none; border: none; color: #d32f2f; cursor: pointer; text-decoration: underline; font-size: 12px; padding: 0; }

.form-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field { display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.3px; }

.field-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  background: #fff;
}
.field-input:focus { border-color: #1976d2; }

.field-textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
  background: #fff;
}
.field-textarea:focus { border-color: #1976d2; }

/* Toggle */
.toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.toggle-label { font-size: 13px; color: #333; }

.toggle-input { display: none; }

.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  background: #ccc;
  border-radius: 10px;
  transition: background 0.2s;
  flex-shrink: 0;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}

.toggle-input:checked + .toggle-switch { background: #1976d2; }
.toggle-input:checked + .toggle-switch::after { transform: translateX(16px); }

.toggle-sm { cursor: pointer; display: inline-flex; align-items: center; }
.toggle-sm .toggle-switch {
  width: 28px;
  height: 16px;
}
.toggle-sm .toggle-switch::after {
  width: 12px;
  height: 12px;
}
.toggle-sm .toggle-input:checked + .toggle-switch::after { transform: translateX(12px); }

.form-divider {
  height: 1px;
  background: #e0e0e0;
  margin: 16px 0;
}

/* Permissions */
.section-subtitle { font-size: 14px; font-weight: 600; color: #333; margin: 0 0 12px; }

.perm-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.perm-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.perm-key {
  width: 80px;
  font-size: 13px;
  font-weight: 500;
  color: #555;
}

.perm-radio-group {
  display: flex;
  gap: 4px;
}

.perm-radio {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #666;
  background: #fff;
}

.perm-radio.active {
  border-color: #1976d2;
  color: #1976d2;
  background: #e3f2fd;
}

.perm-radio input { display: none; }

.perm-desc {
  font-size: 11px;
  color: #aaa;
  margin-left: 8px;
  font-family: 'SF Mono', 'Consolas', monospace;
}

/* ── Memory Tab ── */
.memory-section {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
}

.section-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-icon { color: #888; display: flex; }
.section-title { font-size: 13px; font-weight: 600; color: #333; }

.section-header-right { display: flex; align-items: center; gap: 6px; }

.section-edit-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  color: #666;
}

.section-edit-btn:hover { border-color: #1976d2; color: #1976d2; }

.section-body {
  padding: 12px;
  min-height: 32px;
}

.content-text {
  font-size: 13px;
  line-height: 1.6;
  color: #333;
  white-space: pre-wrap;
  word-break: break-word;
}

.empty-text {
  color: #bbb;
  font-style: italic;
  font-size: 13px;
  margin: 0;
}

.section-edit {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
}

.edit-textarea {
  width: 100%;
  height: 180px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
  color: #333;
  font-family: 'SF Mono', 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
}

.edit-textarea:focus { border-color: #1976d2; }

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}

/* ── Placeholder tabs ── */
.placeholder-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #bbb;
  font-size: 13px;
}

/* ── Buttons ── */
.btn {
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  transition: all 0.15s;
}

.btn:hover { background: #f5f5f5; }
.btn-primary { background: #1976d2; color: #fff; border-color: #1976d2; }
.btn-primary:hover { background: #1565c0; }
.btn-sm { padding: 5px 12px; font-size: 12px; }

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid #e0e0e0;
  flex-shrink: 0;
  background: #fafafa;
}
</style>
