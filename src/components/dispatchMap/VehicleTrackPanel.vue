<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { storeToRefs } from 'pinia'
import { useVehicleTrackStore } from '@/store/useVehicleTrackStore'
import { useVehicleTrackPlayback } from '@/composables/useVehicleTrackPlayback'
import { analyzeTrackStatistics, type TrackStatistics } from '@/utils/trackStatistics'

const store = useVehicleTrackStore()
const {
  points,
  cursor,
  speed,
  playing,
  maxCursor,
  routeGroups,
  activeRouteKey,
} = storeToRefs(store)
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

/** 当前选中的路线分组（多车多路线场景下用） */
const activeGroup = computed(() =>
  routeGroups.value.find((g) => g.key === activeRouteKey.value),
)

/** 拖拽时间轴即视为接管控制权，暂停自动播放，避免时间基准错位。 */
const onSeek = () => {
  pause()
}

const onChangeRoute = (key: string) => {
  store.setActiveRoute(key)
}

/** 轨迹统计：点数变化时重算，统计本身是纯计算不随游标变化。 */
const statistics = computed<TrackStatistics | null>(() => {
  if (!points.value.length) return null
  return analyzeTrackStatistics(points.value)
})

/** 速度区间展示文案（米/秒 → km/h 区间）。 */
const speedBucketLabel = (from: number, to: number): string => {
  const toKmh = (value: number) => (Number.isFinite(value) ? Math.round(value * 3.6) : 0)
  if (!Number.isFinite(to)) return `≥ ${toKmh(from)} km/h`
  return `${toKmh(from)}~${toKmh(to)} km/h`
}

/** 速度分布总数，作为占比分母。 */
const speedSampleTotal = computed(() =>
  (statistics.value?.speedBuckets ?? []).reduce((total, bucket) => total + bucket.count, 0),
)

/** 某速度区间的采样占比（0~100）。 */
const speedBucketPercent = (count: number): number =>
  speedSampleTotal.value > 0 ? Math.round((count / speedSampleTotal.value) * 100) : 0
</script>

<template>
  <div class="vehicle-track-panel" role="region" aria-label="车辆历史轨迹回放">
    <!-- 标题栏 -->
    <div class="vtp-header">
      <span class="vtp-title">
        <Icon icon="mdi:map-marker-path" :size="16" />
        车辆历史轨迹回放
      </span>

      <!-- 多路线场景：胶囊 tab 切换器 -->
      <div v-if="routeGroups.length > 1" class="vtp-route-tabs">
        <button
          v-for="group in routeGroups"
          :key="group.key"
          type="button"
          class="vtp-route-tab"
          :class="{ active: group.key === activeRouteKey }"
          @click="onChangeRoute(group.key)"
        >
          <span class="vtp-route-swatch" :style="{ background: group.color }" />
          <span class="vtp-route-name">{{ group.stationName ?? group.stationId ?? '未知路线' }}</span>
          <span class="vtp-route-count">{{ group.vehicles.length }}</span>
        </button>
      </div>

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

    <!-- 当前路线车辆 chips -->
    <div v-if="activeGroup && activeGroup.vehicles.length" class="vtp-vehicle-chips">
      <span
        v-for="vehicle in activeGroup.vehicles"
        :key="vehicle.vehicleId"
        class="vtp-vehicle-chip"
      >
        <Icon icon="mdi:truck" :size="13" />
        {{ vehicle.plateNumber ?? vehicle.vehicleId }}
      </span>
    </div>

    <!-- 播放控制区 -->
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

    <!-- 轨迹统计（速度分布 / 停留点 / 异常 / 分段指标） -->
    <div v-if="statistics" class="vtp-stats">
      <div class="vtp-stats-grid">
        <div class="vtp-stat-card">
          <span class="vtp-stat-label">总里程</span>
          <span class="vtp-stat-value">{{ (statistics.totalDistanceMeters / 1000).toFixed(2) }}<small>km</small></span>
        </div>
        <div class="vtp-stat-card">
          <span class="vtp-stat-label">平均速度</span>
          <span class="vtp-stat-value">{{ (statistics.averageSpeedMps * 3.6).toFixed(1) }}<small>km/h</small></span>
        </div>
        <div class="vtp-stat-card">
          <span class="vtp-stat-label">最高速度</span>
          <span class="vtp-stat-value">{{ (statistics.maxSpeedMps * 3.6).toFixed(1) }}<small>km/h</small></span>
        </div>
        <div class="vtp-stat-card">
          <span class="vtp-stat-label">停留点</span>
          <span class="vtp-stat-value">{{ statistics.stops.length }}<small>处</small></span>
        </div>
      </div>

      <div v-if="statistics.limitedSample" class="vtp-stats-hint">
        轨迹样本有限（{{ statistics.pointCount }} 个点），统计结论仅供参考
      </div>

      <div v-if="statistics.speedBuckets?.length" class="vtp-speed-bars">
        <div v-for="bucket in statistics.speedBuckets" :key="`${bucket.from}-${bucket.to}`" class="vtp-speed-row">
          <span class="vtp-speed-label">{{ speedBucketLabel(bucket.from, bucket.to) }}</span>
          <el-progress
            :percentage="speedBucketPercent(bucket.count)"
            :stroke-width="6"
            :show-text="false"
            color="var(--accent-cyan)"
          />
          <span class="vtp-speed-value">{{ speedBucketPercent(bucket.count) }}%</span>
        </div>
      </div>

      <div v-if="statistics.stops.length" class="vtp-chip-list">
        <span class="vtp-chip-title">停留点</span>
        <span v-for="(stop, idx) in statistics.stops" :key="idx" class="vtp-chip stop">
          {{ stop.startedAt }} 停留 {{ Math.round(stop.durationSeconds / 60) }} 分钟
        </span>
      </div>

      <div v-if="statistics.anomalies.length" class="vtp-chip-list">
        <span class="vtp-chip-title">异常</span>
        <span v-for="(anomaly, idx) in statistics.anomalies" :key="idx" class="vtp-chip anomaly">
          {{ anomaly.at }} {{ anomaly.message }}
        </span>
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
  padding: 14px 20px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--toolbar-tile-border);
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  box-shadow: var(--toolbar-shadow);
  color: var(--toolbar-tile-text);
  user-select: none;
}

/* ---------- 标题栏 ---------- */

.vtp-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--toolbar-tile-border);
  font-size: 14px;
}

.vtp-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.vtp-datetime {
  margin-left: auto;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
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

/* ---------- 路线胶囊 tabs ---------- */

.vtp-route-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
}

.vtp-route-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--toolbar-tile-border);
  background: var(--toolbar-tile-bg);
  color: var(--toolbar-tile-text);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;

  &:hover {
    background: var(--toolbar-tile-hover-bg);
    border-color: var(--toolbar-tile-hover-border);
  }

  &.active {
    background: var(--toolbar-tile-active-bg);
    border-color: var(--toolbar-tile-active-border);
    color: var(--toolbar-tile-active-text);
  }
}

.vtp-route-swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

.vtp-route-name {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vtp-route-count {
  font-size: 11px;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}

/* ---------- 车辆 chips ---------- */

.vtp-vehicle-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 0 0;
}

.vtp-vehicle-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  background: var(--toolbar-tile-bg);
  border: 1px solid var(--toolbar-tile-border);
  color: var(--toolbar-tile-text);
}

/* ---------- 播放控制区 ---------- */

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
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }
}

/* ---------- 轨迹统计卡片 ---------- */

.vtp-stats {
  margin-top: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--toolbar-tile-border);
}

.vtp-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-sm);
}

.vtp-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px var(--space-sm);
  border-radius: var(--radius-md);
  background: var(--toolbar-tile-bg);
  border: 1px solid var(--toolbar-tile-border);
}

.vtp-stat-label {
  font-size: 11px;
  opacity: 0.7;
}

.vtp-stat-value {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;

  small {
    font-size: 10px;
    font-weight: 400;
    opacity: 0.6;
    margin-left: 2px;
  }
}

.vtp-stats-hint {
  margin-top: var(--space-xs);
  font-size: 12px;
  color: var(--tag-warning-text);
}

/* 速度分布 */

.vtp-speed-bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-sm);
}

.vtp-speed-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.vtp-speed-label {
  flex: 0 0 108px;
  font-size: 12px;
  opacity: 0.7;
}

.vtp-speed-value {
  flex: 0 0 40px;
  text-align: right;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 停留 / 异常 chips */

.vtp-chip-list {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
  font-size: 12px;
}

.vtp-chip-title {
  opacity: 0.7;
}

.vtp-chip {
  padding: 1px 8px;
  border-radius: var(--radius-sm);

  &.stop {
    background: var(--tag-info-bg);
    color: var(--tag-info-text);
  }

  &.anomaly {
    background: var(--tag-warning-bg);
    color: var(--tag-warning-text);
  }
}
</style>
