<script setup lang="ts">
import { ref, computed } from 'vue'
import type { ToolBinding, ToolConstraint } from '@/api/characters'

const ALL_TOOLS = ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'webfetch', 'websearch']

const props = defineProps<{ modelValue?: ToolBinding[] | null }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: ToolBinding[]): void }>()

const localList = computed<ToolBinding[]>(() => props.modelValue || [])

const expanded = ref<Record<string, boolean>>({})

function isEnabled(name: string): boolean {
  return localList.value.some(t => t.name === name)
}

function toggleTool(name: string) {
  const list = [...localList.value]
  const idx = list.findIndex(t => t.name === name)
  if (idx >= 0) {
    list.splice(idx, 1)
  } else {
    list.push({ name })
  }
  emit('update:modelValue', list)
}

function getBinding(name: string): ToolBinding | undefined {
  return localList.value.find(t => t.name === name)
}

function getConstraint(name: string): ToolConstraint {
  const b = getBinding(name)
  return b?.constraints || {}
}

function setConstraint(name: string, key: keyof ToolConstraint, value: any) {
  const list = [...localList.value]
  const idx = list.findIndex(t => t.name === name)
  if (idx < 0) return
  const b = { ...list[idx] }
  const c = { ...(b.constraints || {}) }
  if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    delete c[key]
  } else {
    (c as any)[key] = value
  }
  b.constraints = Object.keys(c).length > 0 ? c : undefined
  list[idx] = b
  emit('update:modelValue', list)
}
</script>

<template>
  <div class="tool-binding-editor">
    <div class="tools-grid">
      <div v-for="tool in ALL_TOOLS" :key="tool" class="tool-card" :class="{ enabled: isEnabled(tool) }">
        <div class="tool-row">
          <span class="tool-name">{{ tool }}</span>
          <label class="toggle-label-wrap">
            <input type="checkbox" :checked="isEnabled(tool)" @change="toggleTool(tool)" class="toggle-input" />
            <span class="toggle-switch"></span>
          </label>
          <button v-if="isEnabled(tool)" class="expand-btn" @click="expanded[tool] = !expanded[tool]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline v-if="!expanded[tool]" points="6 9 12 15 18 9" />
              <polyline v-else points="18 15 12 9 6 15" />
            </svg>
            {{ expanded[tool] ? '收起' : '约束' }}
          </button>
        </div>
        <div v-if="isEnabled(tool) && expanded[tool]" class="constraints-panel">
            <div v-if="['write', 'edit', 'read'].includes(tool)" class="constraint-field">
              <label class="constraint-label">allowed_paths</label>
              <input class="constraint-input" placeholder="例: /src/**, /docs/*" :value="(getConstraint(tool).allowed_paths || []).join(', ')" @input="setConstraint(tool, 'allowed_paths', ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean))" />
            </div>
            <div v-if="['write', 'edit', 'read'].includes(tool)" class="constraint-field">
              <label class="constraint-label">denied_paths</label>
              <input class="constraint-input" placeholder="例: node_modules/**, .env" :value="(getConstraint(tool).denied_paths || []).join(', ')" @input="setConstraint(tool, 'denied_paths', ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean))" />
            </div>
            <div v-if="tool === 'write'" class="constraint-field">
              <label class="constraint-label">max_file_size</label>
              <input class="constraint-input" placeholder="例: 1MB, 512KB" :value="getConstraint(tool).max_file_size || ''" @input="setConstraint(tool, 'max_file_size', ($event.target as HTMLInputElement).value || undefined)" />
            </div>
            <div v-if="tool === 'bash'" class="constraint-field">
              <label class="constraint-label">allowed_commands</label>
              <input class="constraint-input" placeholder="例: npm, node, git, npx" :value="(getConstraint(tool).allowed_commands || []).join(', ')" @input="setConstraint(tool, 'allowed_commands', ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean))" />
            </div>
            <div v-if="tool === 'bash'" class="constraint-field">
              <label class="constraint-label">denied_patterns</label>
              <input class="constraint-input" placeholder="例: rm -rf, sudo, del" :value="(getConstraint(tool).denied_patterns || []).join(', ')" @input="setConstraint(tool, 'denied_patterns', ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean))" />
            </div>
          <label v-if="tool === 'bash'" class="toggle-row">
            <span class="toggle-label">require_confirm_even_in_bypass</span>
            <input type="checkbox" :checked="!!getConstraint(tool).require_confirm_even_in_bypass" @change="setConstraint(tool, 'require_confirm_even_in_bypass', ($event.target as HTMLInputElement).checked || undefined)" class="toggle-input" />
            <span class="toggle-switch"></span>
          </label>
        </div>
      </div>
    </div>
    <p class="tools-hint">勾选 = 启用该工具。展开约束可设置路径/大小/命令限制。</p>
  </div>
</template>

<style scoped>
.tool-binding-editor { border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; }
.tools-grid { display: flex; flex-direction: column; }
.tool-card { border-bottom: 1px solid #f0f0f0; }
.tool-card:last-child { border-bottom: none; }
.tool-card.enabled { background: #fafcff; }
.tool-row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
}
.tool-name {
  flex: 1; font-size: 13px; font-family: 'SF Mono', 'Consolas', monospace; color: #555;
}
.expand-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 2px 8px; border: 1px solid #ddd; border-radius: 4px;
  background: #fff; cursor: pointer; font-size: 11px; color: #888;
}
.expand-btn:hover { border-color: #1976d2; color: #1976d2; }
.constraints-panel {
  padding: 0 12px 10px 24px; display: flex; flex-direction: column; gap: 6px;
}
.constraint-field { display: flex; flex-direction: column; gap: 2px; }
.constraint-label { font-size: 11px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.3px; }
.constraint-input {
  width: 100%; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px;
  font-size: 12px; outline: none; box-sizing: border-box; font-family: 'SF Mono', 'Consolas', monospace;
}
.constraint-input:focus { border-color: #1976d2; }
.toggle-row {
  display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 2px 0;
}
.toggle-label { font-size: 12px; color: #555; }
.toggle-input { display: none; }
.toggle-label-wrap { display: inline-flex; align-items: center; cursor: pointer; }
.toggle-switch {
  position: relative; width: 28px; height: 16px; background: #ccc;
  border-radius: 8px; transition: background 0.2s; flex-shrink: 0;
}
.toggle-switch::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 12px; height: 12px; background: #fff; border-radius: 50%; transition: transform 0.2s;
}
.toggle-input:checked + .toggle-switch { background: #1976d2; }
.toggle-input:checked + .toggle-switch::after { transform: translateX(12px); }
.tools-hint { padding: 6px 12px 8px; font-size: 11px; color: #aaa; margin: 0; border-top: 1px solid #f0f0f0; }
</style>
