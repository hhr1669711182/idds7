import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { CarTrackPoint, RouteGroup } from '@/apis/carTrack'
import { isTerminalIncidentState } from '@/utils/incidentState'

/**
 * 单车历史轨迹条目：一辆车 = 一条轨迹，按 `${routeKey}:${vehicleId}` 唯一标识。
 * 多车多路线场景下，一个警情会有多个 VehicleTrackEntry。
 */
export interface VehicleTrackEntry {
  /** 唯一标识：`${routeKey}:${vehicleId}` */
  trackId: string
  /** 所属路线分组 key（stationId 或 'unknown-station'） */
  routeKey: string
  /** 路线颜色（palette 同色系派生） */
  routeColor: string
  vehicleId: string
  plateNumber: string | null
  startTime: string | null
  endTime: string | null
  stationId: string | null
  stationName: string | null
  /** 轨迹点（按 gpsTime 升序） */
  points: CarTrackPoint[]
}

/**
 * 车辆历史轨迹回放状态：数据来自终态警情触发的查询。
 *
 * 单辆旧模式：points/carId/setTrack 操作一辆车的轨迹（保持向后兼容）。
 * 多辆新模式：trackEntries/routeGroups/setMultiTracks 管理一个警情下的全部车辆轨迹。
 * 两种模式通过 setTrack ↔ setMultiTracks 委托互转，外部调用方不受影响。
 */
export const useVehicleTrackStore = defineStore(
  'vehicleTrack',
  () => {
    /* ============== 单辆旧模式字段（保持向后兼容） ============== */

    /** 轨迹点（按 gpsTime 升序）—— 单辆车时直接操作；多辆车时为 activeRoute 下第一条的别名 */
    const points = ref<CarTrackPoint[]>([])
    /** 当前轨迹所属警情，用于非终态新警情复位 */
    const incidentId = ref('')
    /** 当前轨迹对应车辆 —— 单辆车时直接操作；多辆车时为 activeRoute 下第一条的 vehicleId */
    const carId = ref('')
    /** 「车辆GPS」按钮是否显示 */
    const buttonVisible = ref(false)
    /** 回放面板是否打开 */
    const panelVisible = ref(false)
    /** 时间轴游标（浮点索引，支持帧间插值） */
    const cursor = ref(0)
    const speed = ref<1 | 2 | 4>(1)
    const playing = ref(false)
    /** 查询中，用于防重复点击 */
    const loading = ref(false)
    /** 无数据时点击按钮触发的重新查询计数 */
    const reloadToken = ref(0)
    /** 终态警情标记：跨刷新保留，用于拦截终态警情的原有上图与调派链路 */
    const terminalIncidentId = ref('')
    const terminalState = ref('')

    /* ============== 多辆新模式字段 ============== */

    /** 全部车辆轨迹条目，key = trackId（`${routeKey}:${vehicleId}`） */
    const trackEntries = ref<Map<string, VehicleTrackEntry>>(new Map())
    /** 路线分组元信息（按 stationId 分组） */
    const routeGroups = ref<RouteGroup[]>([])
    /** 面板当前聚焦的路线分组 key */
    const activeRouteKey = ref('')

    /* ============== 计算属性 ============== */

    const maxCursor = computed(() => Math.max(points.value.length - 1, 0))

    /** 当前激活路线下的全部车辆轨迹条目（按 startTime 升序） */
    const getActiveRouteEntries = computed((): VehicleTrackEntry[] => {
      if (!trackEntries.value.size) return []
      const result: VehicleTrackEntry[] = []
      for (const entry of trackEntries.value.values()) {
        if (entry.routeKey === activeRouteKey.value) result.push(entry)
      }
      return result.sort((a, b) => String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')))
    })

    /** 当前激活路线是否有多辆车 */
    const isMultiVehicleRoute = computed(() => getActiveRouteEntries.value.length > 1)

    /* ============== 方法 ============== */

    /**
     * 多车辆场景：一次设置全部轨迹条目 + 路线分组。
     * 默认选中 startTime 最早的路线分组；同时把第一条轨迹同步到旧字段 points/carId。
     */
    const setMultiTracks = (entries: VehicleTrackEntry[], groups: RouteGroup[]) => {
      const map = new Map<string, VehicleTrackEntry>()
      for (const entry of entries) map.set(entry.trackId, entry)
      trackEntries.value = map
      routeGroups.value = groups

      // 默认选中 startTime 最早的路线
      if (groups.length && !activeRouteKey.value) {
        const sorted = [...groups].sort((a, b) => {
          const aStart = a.vehicles[0]?.startTime ?? ''
          const bStart = b.vehicles[0]?.startTime ?? ''
          return aStart.localeCompare(bStart)
        })
        activeRouteKey.value = sorted[0].key
      } else if (!groups.length) {
        activeRouteKey.value = ''
      }

      // 同步到旧字段：activeRoute 下第一条
      syncLegacyFromActiveRoute()

      cursor.value = 0
      playing.value = false
      speed.value = 1
      loading.value = false
      buttonVisible.value = true
    }

    /**
     * 单辆车场景：设置单车轨迹（保持向后兼容）。
     * 内部委托给 setMultiTracks，生成单一条目 + 单一路线分组。
     */
    const setTrack = (
      nextPoints: CarTrackPoint[],
      nextCarId: string,
      nextIncidentId: string,
      options?: { openPanel?: boolean },
    ) => {
      const entry: VehicleTrackEntry = {
        trackId: `single:${nextCarId}`,
        routeKey: 'single',
        routeColor: '#1D9BF0',
        vehicleId: nextCarId,
        plateNumber: null,
        startTime: null,
        endTime: null,
        stationId: null,
        stationName: null,
        points: nextPoints,
      }
      const group: RouteGroup = {
        key: 'single',
        stationId: null,
        stationName: null,
        vehicles: [],
        color: '#1D9BF0',
      }
      setMultiTracks([entry], [group])
      incidentId.value = nextIncidentId
      panelVisible.value = options?.openPanel === true
    }

    /** 切换面板聚焦的路线分组；同时更新旧字段 points/carId 到该路线第一条。 */
    const setActiveRoute = (routeKey: string) => {
      activeRouteKey.value = routeKey
      syncLegacyFromActiveRoute()
      cursor.value = 0
      playing.value = false
    }

    /** 把旧字段 points/carId 同步到 activeRoute 下第一条（多车 → 单车别名桥接）。 */
    const syncLegacyFromActiveRoute = () => {
      const activeEntries = getActiveRouteEntries.value
      if (activeEntries.length) {
        const first = activeEntries[0]
        points.value = first.points
        carId.value = first.vehicleId
      } else if (trackEntries.value.size === 1) {
        // 单辆模式只有一条
        const only = [...trackEntries.value.values()][0]
        points.value = only.points
        carId.value = only.vehicleId
      } else {
        points.value = []
        carId.value = ''
      }
    }

    /** 终态已到但暂无车辆/轨迹：按钮仍显示，面板保持关闭。 */
    const markUnavailable = (nextIncidentId: string) => {
      points.value = []
      carId.value = ''
      incidentId.value = nextIncidentId
      cursor.value = 0
      playing.value = false
      loading.value = false
      buttonVisible.value = true
      panelVisible.value = false
      // 清空多辆新模式字段
      trackEntries.value = new Map()
      routeGroups.value = []
      activeRouteKey.value = ''
    }

    /** 无轨迹时点击按钮：请求按当前警情重新查询。 */
    const requestReload = () => {
      if (loading.value || !incidentId.value) return
      reloadToken.value += 1
    }

    /** 记录终态警情：供刷新恢复与后续消息门控使用 */
    const markTerminal = (nextIncidentId: string, nextState: string) => {
      const id = String(nextIncidentId ?? '').trim()
      const state = String(nextState ?? '')
        .trim()
        .toUpperCase()
      if (!id || !isTerminalIncidentState(state)) return
      terminalIncidentId.value = id
      terminalState.value = state
    }

    /** 清除终态标记：换新警情时调用 */
    const clearTerminal = () => {
      terminalIncidentId.value = ''
      terminalState.value = ''
    }

    /** 指定警情是否已处于终态 */
    const isTerminalIncident = (nextIncidentId?: string | null) => {
      const id = String(nextIncidentId ?? '').trim()
      return Boolean(id) && id === terminalIncidentId.value && isTerminalIncidentState(terminalState.value)
    }

    /** 复位轨迹数据；终态标记需跨刷新保留，不在此清除 */
    const reset = () => {
      points.value = []
      incidentId.value = ''
      carId.value = ''
      cursor.value = 0
      playing.value = false
      speed.value = 1
      loading.value = false
      buttonVisible.value = false
      panelVisible.value = false
      // 清空多辆新模式字段
      trackEntries.value = new Map()
      routeGroups.value = []
      activeRouteKey.value = ''
    }

    /** 面板开关：唯一关闭方式就是再点一次「车辆GPS」 */
    const togglePanel = () => {
      if (!points.value.length) return
      panelVisible.value = !panelVisible.value
      if (!panelVisible.value) playing.value = false
    }

    const setCursor = (next: number) => {
      cursor.value = Math.min(Math.max(next, 0), maxCursor.value)
    }

    return {
      // 旧字段
      points,
      incidentId,
      carId,
      buttonVisible,
      panelVisible,
      cursor,
      speed,
      playing,
      loading,
      reloadToken,
      terminalIncidentId,
      terminalState,
      maxCursor,
      // 新字段
      trackEntries,
      routeGroups,
      activeRouteKey,
      getActiveRouteEntries,
      isMultiVehicleRoute,
      // 方法
      setMultiTracks,
      setTrack,
      setActiveRoute,
      markUnavailable,
      requestReload,
      markTerminal,
      clearTerminal,
      isTerminalIncident,
      reset,
      togglePanel,
      setCursor,
    }
  },
  {
    // 终态标记需在 F5 刷新后继续拦截终态警情的原有上图与调派链路
    persist: {
      storage: sessionStorage,
      pick: ['terminalIncidentId', 'terminalState'],
    },
  },
)
