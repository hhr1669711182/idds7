<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import type { SimilarAlarmCardItem } from '@/const/const.modelAssess'
import { useModelAssessStore } from '@/store/useModelAssessStore'
import ThreeViewer from './ThreeViewer.vue'
import MiniMap from './MiniMap.vue'
import { Icon } from '@iconify/vue'

defineProps<{
  card: SimilarAlarmCardItem
  index: number
}>()

const emit = defineEmits<{
  (e: 'remove', id: string): void
  (e: 'merge', id: string): void
}>()

const handleRemove = (id: string) => emit('remove', id)
const handleMerge = (id: string) => emit('merge', id)

/* 缩略图派生数据：复用主警情的实时要素，保证主警情与相似卡视觉信息一致 */
const store = useModelAssessStore()
const { realtimeFactors, trappedFloors } = storeToRefs(store)
const realtimeFactorsRef = computed(() => realtimeFactors.value)
const trappedFloorsRef = computed(() => trappedFloors.value)

// 相似度颜色计算
const getSimilarityColor = (sim: number) => {
  if (sim >= 90) return '#3385ff'
  if (sim >= 70) return '#ff7a00'
  return '#ff4d4f'
}
</script>

<template>
  <div class="similar-card">
    <div class="views-container">
      <!-- 左侧 3D 模型区 -->
      <div class="thumb-section">
        <div class="building-name">{{ card.buildingName }}</div>
        <div class="thumb">
          <ThreeViewer
            data-source="similarAlarm"
            :similar-card-data="card"
            :realtime-factors="realtimeFactorsRef"
            :trapped-floors="trappedFloorsRef"
            :interactive="false"
            :show-hud="false"
            height="100%"
          />
        </div>
        <div class="fire-floor-tag">起火层: {{ realtimeFactorsRef.fireFloor }}F</div>
      </div>

      <!-- 右侧地图区 -->
      <div class="map-section">
        <div class="map-container">
          <!-- 为了避免冲突，可以给每个卡片的地图加上唯一 mapId -->
          <MiniMap :mapId="`similar-map-${card.id}`" />
          
          <!-- 模拟比例尺 -->
          <div class="scale-bar">50m</div>
        </div>
      </div>
    </div>

    <!-- 底部操作区 -->
    <div class="card-footer">
      <div class="similarity-text">
        相似度 <span :style="{ color: getSimilarityColor(card.similarity) }">{{ card.similarity }}%</span>
      </div>
      <div class="actions">
        <button class="btn-del" @click="handleRemove(card.id)" title="删除">
          <Icon icon="mdi:trash-can-outline" width="14" height="14" />
        </button>
        <button class="btn-merge" @click="handleMerge(card.id)">
          <Icon icon="mdi:plus-circle-outline" width="14" height="14" /> <span class="btn-text">合并</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
@import '../styles/three-viewer.less';

.similar-card {
  flex: 0 0 calc(25% - 7.5px); /* 默认展示 4 个 */
  min-width: 140px;
  max-width: 340px;
  height: 180px;
  @media screen and (max-height: 900px) {
    height: 150px;
  }
  background: #11141a;
  border: 1px solid #1f2940;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  transition: all 0.3s;
}

.similar-card:hover {
  border-color: #3b4558;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}

.views-container {
  display: flex;
  flex-direction: row;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

/* ===================== 左侧 3D 模型区 ===================== */
.thumb-section {
  flex: 1;
  background: #050810;
  border-radius: 6px;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #1f2940;
  min-height: 0;
}

.building-name {
  position: absolute;
  top: 4px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 10px;
  color: #e6ebf5;
  font-weight: 600;
  z-index: 10;
  padding: 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
}

.fire-floor-tag {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background: rgba(255, 77, 79, 0.15);
  border: 1px solid #ff4d4f;
  color: #ff4d4f;
  font-size: 9px;
  padding: 2px 4px;
  border-radius: 4px;
  z-index: 10;
  white-space: nowrap;
  font-weight: 600;
}

.thumb {
  flex: 1;
  width: 100%;
  position: relative;
}

.thumb :deep(.three-viewer) {
  height: 100% !important;
  width: 100%;
  border-radius: 0;
  background: transparent;
}

.thumb :deep(.three-canvas) {
  position: absolute;
  inset: 0;
}

.thumb :deep(.three-canvas canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
}

/* ===================== 右侧地图区 ===================== */
.map-section {
  flex: 1;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  background: #e6ebf5;
  border: 1px solid #1f2940;
  min-height: 0;
}

.map-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.scale-bar {
  position: absolute;
  bottom: 4px;
  left: 4px;
  background: rgba(17, 20, 26, 0.8);
  border: 1px solid #3b4558;
  color: #e6ebf5;
  font-size: 9px;
  padding: 2px 8px;
  border-radius: 4px;
  z-index: 100;
}

/* ===================== 底部操作区 ===================== */
.card-footer {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 6px;
  border-top: 1px solid #1f2940;
  flex-shrink: 0;
}

.similarity-text {
  font-size: 11px;
  color: #8a96b0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.similarity-text span {
  font-weight: 700;
  font-family: 'Consolas', monospace;
}

.actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-del {
  background: transparent;
  border: 1px solid #2a3556;
  color: #5b6478;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.btn-del:hover {
  background: rgba(255, 77, 79, 0.1);
  border-color: #ff4d4f;
  color: #ff4d4f;
}

.btn-merge {
  background: #00b96b;
  border: none;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 2px;
  transition: all 0.2s;
}

.btn-merge:hover {
  background: #009a59;
}
</style>
