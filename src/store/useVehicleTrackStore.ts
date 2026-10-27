import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { CarTrackPoint } from '@/apis/carTrack'
import { isTerminalIncidentState } from '@/utils/incidentState'

/**
 * 车辆历史轨迹回放状态：数据来自终态警情触发的查询，
 * 按钮与面板显隐由 store 统一驱动，地图侧只按 points/cursor 渲染。
 */
export const useVehicleTrackStore = defineStore('vehicleTrack', () => {
  /** 轨迹点（按 gpsTime 升序） */
  const points = ref<CarTrackPoint[]>([])
  /** 当前轨迹所属警情，用于非终态新警情复位 */
  const incidentId = ref('')
  /** 当前轨迹对应车辆 */
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

  const maxCursor = computed(() => Math.max(points.value.length - 1, 0))

  const setTrack = (
    nextPoints: CarTrackPoint[],
    nextCarId: string,
    nextIncidentId: string,
    options?: { openPanel?: boolean },
  ) => {
    points.value = nextPoints
    carId.value = nextCarId
    incidentId.value = nextIncidentId
    cursor.value = 0
    playing.value = false
    speed.value = 1
    loading.value = false
    buttonVisible.value = true
    panelVisible.value = options?.openPanel === true
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
  }

  /** 无轨迹时点击按钮：请求按当前警情重新查询。 */
  const requestReload = () => {
    if (loading.value || !incidentId.value) return
    reloadToken.value += 1
  }

  /** 记录终态警情：供刷新恢复与后续消息门控使用 */
  const markTerminal = (nextIncidentId: string, nextState: string) => {
    const id = String(nextIncidentId ?? '').trim()
    const state = String(nextState ?? '').trim().toUpperCase()
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
    setTrack,
    markUnavailable,
    requestReload,
    markTerminal,
    clearTerminal,
    isTerminalIncident,
    reset,
    togglePanel,
    setCursor,
  }
}, {
  // 终态标记需在 F5 刷新后继续拦截终态警情的原有上图与调派链路
  persist: {
    storage: sessionStorage,
    pick: ['terminalIncidentId', 'terminalState'],
  },
})
