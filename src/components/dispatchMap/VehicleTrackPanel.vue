<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { storeToRefs } from 'pinia'
import { useVehicleTrackStore } from '@/store/useVehicleTrackStore'
import { useVehicleTrackPlayback } from '@/composables/useVehicleTrackPlayback'

const store = useVehicleTrackStore()
const { points, cursor, speed, playing, maxCursor } = storeToRefs(store)
const { toggle, pause } = useVehicleTrackPlayback()

const pointAtCursor = computed(() => {
  const index = Math.min(Math.round(cursor.value), Math.max(points.value.length - 1, 0))
  return points.value[index]
})

const formatClock = (value?: string) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('HH:mm') : '-'
}

const cursorClock = computed(() => formatClock(pointAtCursor.value?.gpsTime))
/** 浮点游标对应的时间：在相邻两帧 gpsTime 间插值，避免取整后整段时间不变。 */
const cursorDateTime = computed(() => {
  const list = points.value
  if (!list.length) return '-'
  const clamped = Math.min(Math.max(cursor.value, 0), list.length - 1)
  const lower = Math.floor(clamped)
  const next = Math.min(lower + 1, list.length - 1)
  const start = dayjs(list[lower]?.gpsTime)
  if (!start.isValid()) return '-'
  const end = dayjs(list[next]?.gpsTime)
  const span = end.isValid() ? end.valueOf() - start.valueOf() : 0
  return dayjs(start.valueOf() + span * (clamped - lower)).format('YYYY-MM-DD HH:mm:ss')
})

/** 时间轴刻度：等分抽样 6 个轨迹点，标签用其 gpsTime 的时分。 */
const marks = computed(() => {
  const total = points.value.length
  if (total < 2) return []
  const count = Math.min(6, total)
  return Array.from({ length: count }, (_, index) => {
    const pointIndex = Math.round((index * (total - 1)) / Math.max(count - 1, 1))
    return {
      index: pointIndex,
      label: formatClock(points.value[pointIndex]?.gpsTime),
      ratio: (pointIndex / (total - 1)) * 100,
    }
  })
})

/** 拖拽时间轴即视为接管控制权，暂停自动播放，避免时间基准错位。 */
const onSeek = () => {
  pause()
}
</script>

<template>
  <div class="vehicle-track-panel" role="region" aria-label="车辆历史轨迹回放">
    <div class="vtp-header">
      <span class="vtp-title">车辆历史轨迹回放</span>
      <span class="vtp-datetime">{{ cursorDateTime }}</span>
      <span class="vtp-speed">
        <em>速度</em>
        <el-select v-model="speed" size="small" class="vtp-speed-select">
          <el-option :value="1" label="1×" />
          <el-option :value="2" label="2×" />
          <el-option :value="4" label="4×" />
        </el-select>
      </span>
    </div>
    <div class="vtp-body">
      <button class="vtp-play" type="button" :aria-label="playing ? '暂停' : '播放'" @click="toggle">
        <Icon :icon="playing ? 'mdi:pause' : 'mdi:play'" :size="20" />
      </button>
      <div class="vtp-timeline">
        <span
          v-if="points.length > 1"
          class="vtp-bubble"
          :style="{ left: `${maxCursor ? (cursor / maxCursor) * 100 : 0}%` }"
        >
          {{ cursorClock }}
        </span>
        <el-slider
          v-if="points.length > 1"
          v-model="cursor"
          :min="0"
          :max="maxCursor"
          :step="0.01"
          :show-tooltip="false"
          @input="onSeek"
        />
        <div class="vtp-marks">
          <span v-for="mark in marks" :key="mark.index" :style="{ left: `${mark.ratio}%` }">{{ mark.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.vehicle-track-panel {
  position: absolute;
  bottom: 96px;
  left: 50%;
  z-index: 101;
  transform: translateX(-50%);
  width: min(870px, calc(100% - 40px));
  box-sizing: border-box;
  padding: 12px 20px 16px;
  border-radius: var(--radius-md);
  border: 1px solid var(--toolbar-border);
  background: var(--toolbar-bg);
  box-shadow: var(--toolbar-shadow);
  color: var(--toolbar-tile-text);
  user-select: none;
}

.vtp-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--toolbar-tile-border);
  font-size: 14px;
}

.vtp-title {
  font-weight: 600;
  letter-spacing: 0.5px;
}

.vtp-datetime {
  margin-left: auto;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}

.vtp-speed {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  opacity: 0.9;

  em {
    font-style: normal;
  }
}

.vtp-speed-select {
  width: 74px;
}

.vtp-body {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 14px;
}

.vtp-play {
  flex: none;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  appearance: none;
  color: var(--el-color-white);
  background: var(--el-color-primary);
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.85;
  }
  &:focus-visible {
    outline: 2px solid var(--active-border);
    outline-offset: 2px;
  }
}

.vtp-timeline {
  position: relative;
  flex: 1;
  padding-top: 6px;
}

.vtp-bubble {
  position: absolute;
  top: -12px;
  z-index: 1;
  transform: translateX(-50%);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  background: var(--el-color-primary);
  color: var(--el-color-white);
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.vtp-marks {
  position: relative;
  height: 16px;
  margin-top: 2px;

  span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-size: 12px;
    line-height: 16px;
    white-space: nowrap;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
  }
}
</style>
