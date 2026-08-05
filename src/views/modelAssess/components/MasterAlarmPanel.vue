<!--
  @Description: 主警情 + 实时要素判研（与 3D 视图双向交互）
 * @FilePath: \ids-gis-web\src\views\modelAssess\components\MasterAlarmPanel.vue
-->
<script setup lang="ts">
import { ref, reactive, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useModelAssessStore } from '@/store/useModelAssessStore'
import { SMOKE_LEVELS, TRAPPED_DIRS } from '@/const/const.modelAssess'

const store = useModelAssessStore()
const { masterAlarm, realtimeFactors, saveHint, selectedFloor, modelLoaded, trappedFloors, trappedTotal, selectedTrappedUuid } = storeToRefs(store)

const isExpanded = ref(false)

const onFactor = <K extends keyof typeof realtimeFactors.value>(
  key: K,
  delta: number,
  min = 0,
  max = 9999,
) => {
  const current = realtimeFactors.value[key]
  if (typeof current !== 'number') return
  const next: any = Math.max(min, Math.min(max, current + delta))
  store.updateFactor(key, next)
}

const setSmoke = (v: string) => store.updateFactor('smokeLevel', v)
const onSave = () => store.saveRealtimeFactors()

/** 在 3D 视图中定位到起火层（强制切换回 3D + 选中起火层） */
const onLocateFireFloor = () => {
  store.locateFireFloorIn3D()
}

// ===================== 受困救援逻辑 =====================
const form = reactive({
  floor: 15,
  direction: TRAPPED_DIRS[0],
  count: 1,
})

const listEl = ref<HTMLElement | null>(null)

const onAdd = () => {
  store.addTrappedFloor({
    floor: form.floor,
    direction: form.direction,
    count: form.count,
  })
}

const onUpdateTrapped = (uuid: string, key: string, val: string | number) => {
  const item = store.trappedFloors.find(t => t.uuid === uuid)
  if (!item) return
  if (key === 'floor') item.floor = Number(val)
  if (key === 'count') item.count = Number(val)
  if (key === 'direction') item.direction = String(val)
}

const onInc = (uuid: string) => store.adjustTrappedCount(uuid, 1)
const onDec = (uuid: string) => store.adjustTrappedCount(uuid, -1)
const onDel = (uuid: string) => {
  if (selectedTrappedUuid.value === uuid) store.clearSelectedTrapped()
  store.removeTrappedFloor(uuid)
}

/** 点击列表项 -> 高亮 3D 中对应的受困标牌 */
const onPickRow = (uuid: string) => {
  store.selectTrappedFloor(uuid)
  // 滚动到可视区
  nextTick(() => {
    const el = listEl.value?.querySelector(`[data-uuid="${uuid}"]`) as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}
</script>

<template>
  <div class="panel-container" :class="{ 'is-collapsed': !isExpanded }">
    <!-- 折叠状态下显示的独立按钮 -->
    <button v-if="!isExpanded" class="collapse-trigger-btn" @click="isExpanded = true">
      展开清单 <Icon icon="mdi:play" width="14" height="14" />
    </button>

    <!-- 展开状态下显示的完整面板 -->
    <div v-show="isExpanded" class="ma-panel master-panel">
      <!-- 头部：建筑名称、地址、收起按钮 -->
      <div class="head">
        <div class="head-info">
          <div class="title-row">
            <Icon icon="mdi:fire" color="#ff4d4f" width="16" height="16" />
            <span class="building-name">{{ masterAlarm.buildingName }}</span>
          </div>
          <div class="address-row">
            <Icon icon="mdi:map-marker-outline" color="#8a96b0" width="14" height="14" />
            <span class="address-text">{{ masterAlarm.address }}</span>
          </div>
        </div>
        <button class="collapse-btn" @click="isExpanded = false">
          收起 <Icon icon="mdi:menu-left" width="16" height="16" />
        </button>
      </div>

      <div class="panel-content">
        <!-- 第一区块：楼层、起火、受困、烟雾 -->
        <div class="section-wrapper orange">
          <div class="info-box">
            <div class="factor-row">
              <span class="label">
                <Icon icon="mdi:pound" color="#3385ff" width="14" height="14" /> 楼层总数:
              </span>
              <div class="ctrl">
                <button class="step-btn" @click="onFactor('totalFloors', -1, 1)">−</button>
                <div class="val">{{ realtimeFactors.totalFloors }}</div>
                <button class="step-btn" @click="onFactor('totalFloors', 1)">+</button>
              </div>
              <span class="note">{{ realtimeFactors.totalFloors }}层/{{ realtimeFactors.buildingHeight }}m</span>
            </div>

            <div class="factor-row">
              <span class="label">
                <Icon icon="mdi:fire" color="#ff4d4f" width="14" height="14" /> 起火楼层:
              </span>
              <div class="ctrl">
                <button class="step-btn" @click="onFactor('fireFloor', -1, 1)">−</button>
                <div class="val">{{ realtimeFactors.fireFloor }}</div>
                <button class="step-btn" @click="onFactor('fireFloor', 1)">+</button>
              </div>
              <span class="note fire-highlight">第{{ realtimeFactors.fireFloor }}层</span>
            </div>

            <div class="factor-row">
              <span class="label">
                <Icon icon="mdi:account-group-outline" color="#3385ff" width="14" height="14" /> 受困人数:
              </span>
              <div class="ctrl">
                <button class="step-btn" @click="onFactor('trappedPeople', -1, 0)">−</button>
                <div class="val">{{ trappedTotal }}</div>
                <button class="step-btn" @click="onFactor('trappedPeople', 1)">+</button>
              </div>
              <span class="note">{{ trappedTotal }}人</span>
            </div>

            <div class="smoke-row">
              <span class="label">
                <Icon icon="mdi:weather-windy" color="#ff7a00" width="18" height="18" /> 烟雾要素:
              </span>
              <div class="smoke-ctrl">
                <div class="select-wrapper">
                  <select :value="realtimeFactors.smokeLevel" @change="setSmoke(($event.target as HTMLSelectElement).value)">
                    <option v-for="lvl in SMOKE_LEVELS" :key="lvl" :value="lvl">{{ lvl }}</option>
                  </select>
                  <Icon icon="mdi:chevron-down" class="select-arrow" />
                </div>
                <div class="select-wrapper">
                  <select>
                    <option value="black">黑色</option>
                    <option value="white">白色</option>
                    <option value="yellow">黄色</option>
                  </select>
                  <span class="color-dot"></span>
                  <Icon icon="mdi:chevron-down" class="select-arrow" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 第二区块：高空受困搜救布控 暂不开发 -->
        <div class="rescue-title-wrapper" v-if="false">
          <div class="rescue-title">
            <Icon icon="mdi:account-group-outline" width="16" height="16" />
            高空受困搜救布控
          </div>
          <button class="add-mini-btn" @click="onAdd" title="添加受困区域">
            <Icon icon="mdi:account-plus-outline" width="14" height="14" />
          </button>
        </div>
        
        <div class="section-wrapper blue" v-if="false">
          <div class="info-box rescue-box">
            <div class="trapped-list" ref="listEl">
              <div
                v-for="t in trappedFloors"
                :key="t.uuid"
                :data-uuid="t.uuid"
                :class="['trapped-item', { active: t.uuid === selectedTrappedUuid }]"
                @click="onPickRow(t.uuid)"
              >
                <div class="item-left">
                  <div class="floor-input">
                    <input type="number" :value="t.floor" @input="e => onUpdateTrapped(t.uuid, 'floor', (e.target as HTMLInputElement).value)" />
                  </div>
                  <span class="unit">F</span>
                  <span class="divider">|</span>
                  <div class="count-input">
                    <span class="label">人数:</span>
                    <input type="number" :value="t.count" @input="e => onUpdateTrapped(t.uuid, 'count', (e.target as HTMLInputElement).value)" />
                  </div>
                </div>
                
                <div class="item-right">
                  <div class="dir-select">
                    <select :value="t.direction" @change="e => onUpdateTrapped(t.uuid, 'direction', (e.target as HTMLSelectElement).value)">
                      <option v-for="d in TRAPPED_DIRS" :key="d" :value="d">{{ d }}</option>
                    </select>
                    <Icon icon="mdi:chevron-down" class="select-arrow" />
                  </div>
                  <div class="actions">
                    <button class="mini-btn" @click.stop="onDec(t.uuid)">−</button>
                    <button class="mini-btn" @click.stop="onInc(t.uuid)">+</button>
                    <button class="del-btn" @click.stop="onDel(t.uuid)">
                      <Icon icon="mdi:trash-can-outline" width="12" height="12" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
@import '../styles/model-assess.less';

.locate-btn {
  background: rgba(255, 122, 0, 0.15);
  border: 1px solid #ff7a00;
  color: #ff7a00;
  padding: 1px 6px;
  border-radius: 2px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.locate-btn:hover {
  background: rgba(255, 122, 0, 0.3);
}

.locate-hint {
  color: #22c55e;
  font-size: 10px;
  font-weight: 600;
}

/* ===================== 新增受困救援样式 ===================== */
.rescue-section {
  border-top: 1px solid #1f2940;
  background: rgba(13, 19, 34, 0.4);
}

.section-title {
  padding: 8px 12px;
  font-size: 11px;
  color: #8a96b0;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 122, 0, 0.05);
}

.section-title .dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #ff7a00;
}

.trapped-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  max-height: 150px;
  overflow-y: auto;
}

.trapped-item {
  display: grid;
  grid-template-columns: 40px 1fr 60px 20px;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  padding: 4px 6px;
  background: #0d1322;
  border: 1px solid #1f2940;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.2s;
}

.trapped-item:hover {
  background: rgba(26, 34, 54, 0.5);
  border-color: #2a3556;
}

.trapped-item.active {
  background: rgba(255, 122, 0, 0.1);
  border-color: #ff7a00;
  box-shadow: inset 0 0 8px rgba(255, 122, 0, 0.2);
}

.trapped-item .floor {
  color: #e6ebf5;
  font-weight: 700;
  font-family: 'Consolas', monospace;
}

.trapped-item .dir {
  color: #8a96b0;
}

.trapped-item .count-ctrl {
  display: flex;
  align-items: center;
  gap: 2px;
}

.trapped-item .count-ctrl button {
  width: 16px;
  height: 16px;
  background: #131826;
  border: 1px solid #1f2940;
  color: #e6ebf5;
  border-radius: 2px;
  cursor: pointer;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.trapped-item .count-ctrl button:hover {
  border-color: #ff7a00;
  color: #ff7a00;
}

.trapped-item .count-ctrl .num {
  flex: 1;
  text-align: center;
  color: #ff7a00;
  font-weight: 700;
  font-family: 'Consolas', monospace;
}

.trapped-item .del {
  background: transparent;
  border: none;
  color: #5b6478;
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.trapped-item .del:hover {
  color: #ff4d4f;
}


/* ===================== 展开折叠样式 ===================== */
.toggle-btn {
  background: transparent;
  border: none;
  color: #8a96b0;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}
.toggle-btn:hover {
  color: #ff7a00;
  background: rgba(255, 122, 0, 0.1);
}

/* ===================== 新增暗黑科幻风格面板样式 ===================== */
.ma-panel {
  background: #11141a;
  border-radius: 8px;
  border: 1px solid #1f2940;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  font-family: 'PingFang SC', sans-serif;
  color: #e6ebf5;
  transition: all 0.3s ease;
  width: 250px; /* 固定面板宽度 */
  max-height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 16px;
  background: #151a24;
  border-bottom: 1px solid #1f2940;
}

.head-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.building-name {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.5px;
}

.address-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.address-text {
  font-size: 11px;
  color: #8a96b0;
  max-width: 140px;
  white-space: wrap;
}

.collapse-btn {
  background: transparent;
  border: 1px solid #2a3556;
  color: #e6ebf5;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
  transition: all 0.2s;
}

.collapse-btn:hover {
  background: #1f2940;
  border-color: #3b4558;
}

.panel-content {
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
}

/* ===================== 信息区块通用样式 ===================== */
.section-wrapper {
  position: relative;
  padding-left: 12px;
  margin-bottom: 12px;
}

.section-wrapper::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 2px;
}

.section-wrapper.orange::before {
  background: #ff7a00;
  box-shadow: 0 0 6px rgba(255, 122, 0, 0.4);
}

.section-wrapper.blue::before {
  background: #3385ff;
  box-shadow: 0 0 6px rgba(51, 133, 255, 0.4);
}

.info-box {
  border: 1px solid #2a3556;
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: transparent;
}

.factor-row {
  display: grid;
  // grid-template-columns: 85px 100px 1fr;
  align-items: center;
  gap: 8px;
}

.factor-row .label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8a96b0;
}

.factor-row .ctrl {
  display: flex;
  align-items: center;
  background: #151a24;
  border: 1px solid #1f2940;
  border-radius: 4px;
  overflow: hidden;
  height: 24px;
}

.factor-row .step-btn {
  width: 24px;
  height: 100%;
  background: transparent;
  border: none;
  color: #8a96b0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.2s;
}

.factor-row .step-btn:hover {
  background: #1f2940;
  color: #fff;
}

.factor-row .val {
  flex: 1;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  font-family: 'Consolas', monospace;
  color: #e6ebf5;
  border-left: 1px solid #1f2940;
  border-right: 1px solid #1f2940;
  line-height: 24px;
  background: #0d1322;
}

.factor-row .note {
  font-size: 11px;
  color: #e6ebf5;
  text-align: right;
  white-space: nowrap;
}

.fire-highlight {
  color: #ff7a00 !important;
  font-weight: 600;
}

/* ===================== 烟雾要素特殊行 ===================== */
.smoke-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid #1f2940;
}

.smoke-ctrl {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
}

.select-wrapper {
  position: relative;
  width: 80px;
}

.select-wrapper select {
  width: 100%;
  height: 24px;
  background: #151a24;
  border: 1px solid #1f2940;
  color: #e6ebf5;
  border-radius: 4px;
  padding: 0 20px 0 8px;
  font-size: 11px;
  appearance: none;
  outline: none;
  cursor: pointer;
  transition: all 0.2s;
}

.select-wrapper select:hover, .select-wrapper select:focus {
  border-color: #3385ff;
}

.select-wrapper select option {
  background: #11141a;
  color: #e6ebf5;
}

.select-wrapper .select-arrow {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  color: #8a96b0;
  pointer-events: none;
}

.color-dot {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2a3556;
  pointer-events: none;
}

.select-wrapper select:has(option[value="black"]:checked) + .color-dot { background: #1a1a1a; border: 1px solid #333; }
.select-wrapper select:has(option[value="white"]:checked) + .color-dot { background: #e6ebf5; }
.select-wrapper select:has(option[value="yellow"]:checked) + .color-dot { background: #fbbf24; }

.select-wrapper:has(.color-dot) select {
  padding-left: 22px;
}

/* ===================== 高空受困搜救布控 ===================== */
.rescue-title-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  margin-top: 4px;
}

.rescue-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #3385ff;
}

.add-mini-btn {
  background: rgba(51, 133, 255, 0.1);
  border: 1px solid rgba(51, 133, 255, 0.3);
  color: #3385ff;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  z-index: 10;
}

.add-mini-btn:hover {
  background: #3385ff;
  color: #fff;
}

.rescue-box {
  padding: 8px;
  gap: 8px;
}

.trapped-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
}

.trapped-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: transparent;
  border: 1px solid #1f2940;
  border-radius: 4px;
  padding: 6px 8px;
}

.item-left, .item-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.floor-input {
  display: flex;
  align-items: center;
}

.floor-input input {
  width: 28px;
  background: #151a24;
  border: 1px solid #1f2940;
  color: #3385ff;
  font-size: 12px;
  font-weight: 600;
  font-family: 'Consolas', monospace;
  text-align: center;
  outline: none;
  transition: all 0.2s;
  border-radius: 4px;
  padding: 2px 0;
}
.floor-input input:hover, .floor-input input:focus {
  border-color: #3385ff;
}

.unit {
  color: #3385ff;
  font-weight: 600;
  font-size: 12px;
}

.divider {
  color: #1f2940;
  font-size: 10px;
}

.count-input {
  display: flex;
  align-items: center;
  gap: 4px;
}

.count-input .label {
  font-size: 11px;
  color: #8a96b0;
}

.count-input input {
  width: 32px;
  background: #151a24;
  border: 1px solid #1f2940;
  border-radius: 4px;
  color: #e6ebf5;
  font-size: 11px;
  text-align: center;
  outline: none;
  padding: 2px 0;
  transition: all 0.2s;
}
.count-input input:hover, .count-input input:focus {
  border-color: #3385ff;
}

.floor-input input::-webkit-outer-spin-button,
.floor-input input::-webkit-inner-spin-button,
.count-input input::-webkit-outer-spin-button,
.count-input input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.floor-input input[type=number],
.count-input input[type=number] {
  -moz-appearance: textfield;
}

.dir-select {
  position: relative;
  width: 72px;
}

.dir-select select {
  width: 100%;
  background: #151a24;
  border: 1px solid #1f2940;
  color: #3385ff;
  font-size: 11px;
  border-radius: 4px;
  padding: 2px 16px 2px 6px;
  appearance: none;
  outline: none;
  transition: all 0.2s;
  cursor: pointer;
}
.dir-select select:hover, .dir-select select:focus {
  border-color: #3385ff;
}

.dir-select select option {
  background: #11141a;
  color: #3385ff;
}

.dir-select .select-arrow {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  color: #3385ff;
  pointer-events: none;
  font-size: 12px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mini-btn {
  width: 20px;
  height: 20px;
  background: #151a24;
  border: 1px solid #1f2940;
  border-radius: 4px;
  color: #8a96b0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.mini-btn:hover {
  border-color: #3385ff;
  color: #3385ff;
}

.del-btn {
  width: 20px;
  height: 20px;
  background: rgba(255, 77, 79, 0.1);
  border: 1px solid rgba(255, 77, 79, 0.3);
  border-radius: 4px;
  color: #ff4d4f;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.del-btn:hover {
  background: #ff4d4f;
  color: #fff;
}

.add-new-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  padding: 6px 0;
  background: rgba(51, 133, 255, 0.1);
  border: 1px dashed rgba(51, 133, 255, 0.4);
  border-radius: 4px;
  color: #3385ff;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
}

.add-new-btn:hover {
  background: rgba(51, 133, 255, 0.2);
  border-color: #3385ff;
}

/* ===================== 其他 ===================== */
.panel-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.collapse-trigger-btn {
  background: #1c2438;
  border: 1px solid #2a3556;
  color: #e6ebf5;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: all 0.2s;
}

.collapse-trigger-btn:hover {
  background: #2a3556;
  color: #fff;
}
</style>
