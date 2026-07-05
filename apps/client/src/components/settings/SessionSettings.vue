<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingRow from './SettingRow.vue'

const { t } = useI18n()

const streaming = ref(true)
const compact = ref(false)
const showReasoning = ref(true)
const showCost = ref(false)

const blockEventInterrupt = ref(localStorage.getItem('blockEventInterrupt') === 'true')
function toggleBlock() {
  blockEventInterrupt.value = !blockEventInterrupt.value
  localStorage.setItem('blockEventInterrupt', String(blockEventInterrupt.value))
}

const schedulerInterval = ref(localStorage.getItem('eventSchedulerInterval') || '10')
function setSchedulerInterval() {
  localStorage.setItem('eventSchedulerInterval', schedulerInterval.value)
}

const archiveHours = ref(localStorage.getItem('eventArchiveHours') || '24')
function setArchiveHours() {
  localStorage.setItem('eventArchiveHours', archiveHours.value)
}
</script>

<template>
  <section class="settings-section">
    <h3 class="section-title">{{ t('session.title') }}</h3>
    <p class="section-desc">{{ t('session.desc') }}</p>

    <SettingRow :label="t('display.streaming')" :hint="t('display.streamingHint')">
      <label class="switch">
        <input v-model="streaming" type="checkbox" />
        <span class="switch-slider"></span>
      </label>
    </SettingRow>

    <SettingRow :label="t('display.compact')" :hint="t('display.compactHint')">
      <label class="switch">
        <input v-model="compact" type="checkbox" />
        <span class="switch-slider"></span>
      </label>
    </SettingRow>

    <SettingRow :label="t('display.showReasoning')" :hint="t('display.showReasoningHint')">
      <label class="switch">
        <input v-model="showReasoning" type="checkbox" />
        <span class="switch-slider"></span>
      </label>
    </SettingRow>

    <SettingRow :label="t('display.showCost')" :hint="t('display.showCostHint')">
      <label class="switch">
        <input v-model="showCost" type="checkbox" />
        <span class="switch-slider"></span>
      </label>
    </SettingRow>

    <div class="section-divider"></div>
    <h4 class="subsection-title">事件</h4>

    <SettingRow label="默认不允许打断" hint="开启后事件对话默认禁止输入，需手动点击「允许打断」">
      <label class="switch">
        <input type="checkbox" :checked="blockEventInterrupt" @change="toggleBlock" />
        <span class="switch-slider"></span>
      </label>
    </SettingRow>

    <SettingRow label="调度轮询间隔（秒）" hint="事件调度器检查待处理事件的间隔">
      <input type="number" min="1" max="300" class="setting-input" v-model.number="schedulerInterval" @change="setSchedulerInterval" />
    </SettingRow>

    <SettingRow label="自动归档时间（小时）" hint="已完成/失败事件超过此时间后自动归档">
      <input type="number" min="1" max="720" class="setting-input" v-model.number="archiveHours" @change="setArchiveHours" />
    </SettingRow>
  </section>
</template>

<style scoped>
.settings-section {
  max-width: 640px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 4px;
}

.section-desc {
  font-size: 13px;
  color: #888;
  margin-bottom: 20px;
}

.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #ccc;
  border-radius: 22px;
  transition: 0.2s;
}

.switch-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 2px;
  bottom: 2px;
  background: #fff;
  border-radius: 50%;
  transition: 0.2s;
}

.switch input:checked + .switch-slider {
  background: #1976d2;
}

.switch input:checked + .switch-slider::before {
  transform: translateX(18px);
}

.setting-input {
  width: 80px;
  padding: 6px 10px;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
}
</style>
