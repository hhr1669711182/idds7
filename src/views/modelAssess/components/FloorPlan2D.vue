<!--
  @Description: 楼层 2D 俯视平面图（SVG 渲染，零依赖）
 * @FilePath: \ids-gis-web\src\views\modelAssess\components\FloorPlan2D.vue
-->
<script setup lang="ts">
import { computed } from 'vue'
import type { TrappedFloorItem, RealtimeFactors } from '@/const/const.modelAssess'

interface Props {
  floor: number
  realtimeFactors: RealtimeFactors
  trappedFloors: TrappedFloorItem[]
  /** 消防栓点位（按楼层） */
  hydrants?: { name: string; x: number; y: number }[]
}

const props = withDefaults(defineProps<Props>(), {
  hydrants: () => [
    { name: 'KX1', x: 30, y: 25 },
    { name: 'KX2', x: 70, y: 25 },
    { name: 'KX3', x: 50, y: 75 },
  ],
})

const emit = defineEmits<{
  (e: 'pick-marker', uuid: string): void
  (e: 'pick-hydrant', name: string): void
}>()

const isFireFloor = computed(() => props.floor === props.realtimeFactors.fireFloor)
const smokeOpacity = computed(() => {
  const map: Record<string, number> = { '轻度 (Light)': 0.15, '中度 (Medium)': 0.4, '重度 (Heavy)': 0.7 }
  return map[props.realtimeFactors.smokeLevel] ?? 0.3
})

/** 当前楼层的受困人员 */
const floorTrapped = computed(() => props.trappedFloors.filter((t) => t.floor === props.floor))

/** 东南 / 西北 / 东北 / 西南 方位坐标 */
const DIRECTION_POS: Record<string, { x: number; y: number }> = {
  东南角: { x: 80, y: 80 },
  西北角: { x: 20, y: 20 },
  东北角: { x: 80, y: 20 },
  西南角: { x: 20, y: 80 },
}

const pickMarker = (uuid: string) => emit('pick-marker', uuid)
const pickHydrant = (name: string) => emit('pick-hydrant', name)
</script>

<template>
  <div class="plan-2d">
    <div class="plan-header">
      <span class="title">📐 第 {{ floor }} 层 / 平面图</span>
      <span class="meta">{{ realtimeFactors.fireFloor === floor ? '🔥 起火层' : '常态' }}</span>
    </div>
    <svg class="plan-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
      <!-- 背景 -->
      <rect x="0" y="0" width="100" height="100" fill="#0d1322" />

      <!-- 房间网格（4x4） -->
      <g class="rooms" stroke="#2a3556" stroke-width="0.3" fill="none">
        <line v-for="i in 4" :key="`v${i}`" :x1="i * 20" y1="0" :x2="i * 20" y2="100" />
        <line v-for="i in 4" :key="`h${i}`" x1="0" :y1="i * 20" x2="100" :y2="i * 20" />
        <rect x="2" y="2" width="96" height="96" stroke="#4a5a7a" stroke-width="0.5" fill="none" />
      </g>

      <!-- 起火层高亮 -->
      <rect
        v-if="isFireFloor"
        x="2"
        y="2"
        width="96"
        height="96"
        fill="none"
        stroke="#ff7a00"
        stroke-width="0.8"
      />

      <!-- 烟雾覆盖（半透明灰雾） -->
      <rect
        v-if="smokeOpacity > 0"
        x="2"
        y="2"
        width="96"
        height="96"
        fill="#888"
        :opacity="smokeOpacity"
        pointer-events="none"
      />

      <!-- 楼梯（中间十字） -->
      <g class="stair" stroke="#8a96b0" stroke-width="0.4" fill="none">
        <rect x="46" y="46" width="8" height="8" fill="#1a2236" />
        <line x1="46" y1="48" x2="54" y2="48" />
        <line x1="46" y1="50" x2="54" y2="50" />
        <line x1="46" y1="52" x2="54" y2="52" />
        <text x="50" y="60" fill="#8a96b0" font-size="2" text-anchor="middle">楼梯</text>
      </g>

      <!-- 消防栓 -->
      <g
        v-for="(h, i) in hydrants"
        :key="`h${i}`"
        class="hydrant"
        :transform="`translate(${h.x},${h.y})`"
        @click="pickHydrant(h.name)"
      >
        <circle r="2.5" fill="#ff2222" stroke="#fff" stroke-width="0.3" />
        <text y="0.8" font-size="2" fill="#fff" text-anchor="middle" font-weight="700">{{ h.name }}</text>
      </g>

      <!-- 受困人员（按方位放置） -->
      <g
        v-for="(t, i) in floorTrapped"
        :key="`t${i}-${t.uuid}`"
        :transform="`translate(${DIRECTION_POS[t.direction]?.x ?? 50},${DIRECTION_POS[t.direction]?.y ?? 50})`"
        class="trapped-marker"
        @click="pickMarker(t.uuid)"
      >
        <circle r="3" fill="#ff3030" stroke="#fff" stroke-width="0.4" />
        <text y="0.8" font-size="2" fill="#fff" text-anchor="middle" font-weight="700">👥{{ t.count }}</text>
        <text :y="6" font-size="2" fill="#ff3030" text-anchor="middle">{{ t.direction }} {{ t.floor }}F</text>
      </g>

      <!-- 起火点标记（如果是起火层） -->
      <g v-if="isFireFloor" class="fire-marker" transform="translate(80, 30)">
        <circle r="3.5" fill="#ff7a00">
          <animate attributeName="r" values="3.5;5;3.5" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <text y="0.8" font-size="2.2" fill="#fff" text-anchor="middle" font-weight="700">🔥</text>
      </g>

      <!-- 标题 -->
      <text x="50" y="5" fill="#ff9500" font-size="3" text-anchor="middle" font-weight="700">
        F{{ floor }} 平面图
      </text>
    </svg>
  </div>
</template>

<style lang="less" scoped>
@import '../styles/plan-2d.less';
</style>
