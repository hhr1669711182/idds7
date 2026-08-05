<!--
  @Description: 构件详情弹窗（Element Plus Popover，4 种构件类型）
 * @FilePath: \ids-gis-web\src\views\modelAssess\components\ComponentDetailPopover.vue
-->
<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useModelAssessStore } from '@/store/useModelAssessStore'

const store = useModelAssessStore()
const { selectedComponent, realtimeFactors, trappedFloors, masterAlarm } = storeToRefs(store)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit-trapped', uuid: string): void
  (e: 'locate-floor', floor: number): void
}>()

const trappedItem = computed(() => {
  if (selectedComponent.value?.type !== 'trappedPerson' || !selectedComponent.value.uuid) return null
  return trappedFloors.value.find((t) => t.uuid === selectedComponent.value!.uuid) || null
})

const title = computed(() => {
  if (!selectedComponent.value) return ''
  const map: Record<string, string> = {
    floor: '楼层详情',
    trappedPerson: '受困人员详情',
    hydrant: '消防栓详情',
    fireTruck: '消防车辆详情',
    fireFighter: '消防员详情',
  }
  return map[selectedComponent.value.type] || '构件详情'
})

const onClose = () => {
  store.clearSelectedComponent()
  emit('close')
}

const onLocate = () => {
  if (selectedComponent.value?.floor) {
    // 强制切到 3D + 选中目标楼层 + 关闭弹窗（弹窗是 2D 上下文，3D 中保留高亮即可）
    store.locateFloorIn3D(selectedComponent.value.floor)
    store.clearSelectedComponent()
    emit('locate-floor', selectedComponent.value.floor)
  }
}

const onEdit = () => {
  if (trappedItem.value) emit('edit-trapped', trappedItem.value.uuid)
}
</script>

<template>
  <transition name="popover-fade">
    <div v-if="selectedComponent" class="component-popover" @click.stop>
      <div class="cp-header">
        <span class="cp-title">{{ title }}</span>
        <button class="cp-close" @click="onClose">✕</button>
      </div>

      <div class="cp-body">
        <!-- 楼层详情 -->
        <template v-if="selectedComponent.type === 'floor'">
          <div class="cp-row">
            <span class="cp-key">楼层：</span>
            <span class="cp-val">第 {{ selectedComponent.floor }} 层</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">建筑：</span>
            <span class="cp-val">{{ masterAlarm.buildingName }}</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">总层 / 总高：</span>
            <span class="cp-val">
              {{ realtimeFactors.totalFloors }} 层 / {{ realtimeFactors.buildingHeight }}m
            </span>
          </div>
          <div
            v-if="realtimeFactors.fireFloor === selectedComponent.floor"
            class="cp-row fire-row"
          >
            <span class="cp-key">状态：</span>
            <span class="cp-val">🔥 当前为起火层</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">起火层：</span>
            <span class="cp-val fire-val">第 {{ realtimeFactors.fireFloor }} 层</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">烟雾：</span>
            <span class="cp-val">{{ realtimeFactors.smokeLevel }}</span>
          </div>
          <div class="cp-actions">
            <button class="cp-btn primary" @click="onLocate">📍 定位到 3D 视图</button>
          </div>
        </template>

        <!-- 受困人员 -->
        <template v-else-if="selectedComponent.type === 'trappedPerson' && trappedItem">
          <div class="cp-row">
            <span class="cp-key">楼层：</span>
            <span class="cp-val">第 {{ trappedItem.floor }} 层</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">方位：</span>
            <span class="cp-val">{{ trappedItem.direction }}</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">人数：</span>
            <span class="cp-val fire-val">{{ trappedItem.count }} 人</span>
          </div>
          <div class="cp-actions">
            <button class="cp-btn primary" @click="onLocate">📍 定位到 3D 视图</button>
            <button class="cp-btn" @click="onEdit">✏️ 编辑</button>
          </div>
        </template>

        <!-- 消防栓 -->
        <template v-else-if="selectedComponent.type === 'hydrant'">
          <div class="cp-row">
            <span class="cp-key">编号：</span>
            <span class="cp-val">{{ selectedComponent.name }}</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">类型：</span>
            <span class="cp-val">市政消火栓</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">状态：</span>
            <span class="cp-val green-val">● 可用</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">距主建筑：</span>
            <span class="cp-val">~50m</span>
          </div>
        </template>

        <!-- 消防车 -->
        <template v-else-if="selectedComponent.type === 'fireTruck'">
          <div class="cp-row">
            <span class="cp-key">车辆：</span>
            <span class="cp-val">{{ selectedComponent.name || '消防车' }}</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">车型：</span>
            <span class="cp-val">水罐 / 泡沫消防车</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">驾驶员：</span>
            <span class="cp-val">王 XX</span>
          </div>
          <div class="cp-row">
            <span class="cp-key">状态：</span>
            <span class="cp-val orange-val">● 正在前往</span>
          </div>
        </template>
      </div>
    </div>
  </transition>
</template>

<style lang="less" scoped>
.component-popover {
  position: absolute;
  top: 60px;
  right: 12px;
  width: 280px;
  background: linear-gradient(180deg, #131826 0%, #1a2236 100%);
  border: 1px solid #ff7a00;
  border-radius: 6px;
  box-shadow: 0 0 20px rgba(255, 122, 0, 0.3);
  z-index: 30;
  pointer-events: auto;
}

.cp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #2a3556;
  background: linear-gradient(90deg, rgba(255, 122, 0, 0.15), transparent);
}

.cp-title {
  color: #ff7a00;
  font-size: 13px;
  font-weight: 600;
}

.cp-close {
  background: transparent;
  border: none;
  color: #8a96b0;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.cp-close:hover {
  color: #ff4d4f;
}

.cp-body {
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.8;
  color: #e6ebf5;
}

.cp-row {
  display: flex;
  gap: 4px;
}

.cp-key {
  color: #8a96b0;
  flex-shrink: 0;
}

.cp-val {
  color: #e6ebf5;
  font-weight: 500;
}

.cp-val.fire-val {
  color: #ff7a00;
  font-weight: 700;
}

.cp-val.green-val {
  color: #22c55e;
}

.cp-val.orange-val {
  color: #ff9500;
}

.cp-row.fire-row {
  background: rgba(255, 77, 79, 0.1);
  margin: 4px -4px;
  padding: 2px 4px;
  border-radius: 2px;
}

.cp-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  border-top: 1px solid #1f2940;
  padding-top: 10px;
}

.cp-btn {
  flex: 1;
  background: transparent;
  border: 1px solid #2a3556;
  color: #e6ebf5;
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s;
}

.cp-btn:hover {
  border-color: #ff7a00;
  color: #ff7a00;
}

.cp-btn.primary {
  background: rgba(255, 122, 0, 0.15);
  border-color: #ff7a00;
  color: #ff7a00;
}

.cp-btn.primary:hover {
  background: rgba(255, 122, 0, 0.25);
}

.popover-fade-enter-active,
.popover-fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.popover-fade-enter-from,
.popover-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
