import { onUnmounted, watch } from 'vue'
import { useVehicleTrackStore } from '@/store/useVehicleTrackStore'

/** gpsTime 统一为 `yyyy-MM-dd HH:mm:ss`，解析失败返回 NaN。 */
const parseGpsTime = (value?: string) => {
  if (!value) return Number.NaN
  const timestamp = Date.parse(value.replace(' ', 'T'))
  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

/**
 * 车辆历史轨迹回放：以 gpsTime 为时间轴推进游标，帧间做线性插值，
 * 倍速只压缩真实时间跨度，不改变轨迹几何。
 */
export const useVehicleTrackPlayback = () => {
  const store = useVehicleTrackStore()
  let handle: number | null = null
  let baseGpsMs = 0
  let baseNow = 0
  /** 时间轴缓存，播放期间不随帧重算 */
  let timeList: number[] = []

  const times = () => store.points.map((point) => parseGpsTime(point.gpsTime))

  const stopFrame = () => {
    if (handle !== null) cancelAnimationFrame(handle)
    handle = null
  }

  /** 把 gps 时间换算成浮点索引，用于帧间插值定位。 */
  const locate = (gpsMs: number, list: number[]) => {
    if (!list.length) return 0
    let index = 0
    for (let i = 1; i < list.length; i += 1) {
      if (list[i] <= gpsMs) index = i
      else break
    }
    const next = Math.min(index + 1, list.length - 1)
    const span = list[next] - list[index]
    const ratio = span > 0 ? (gpsMs - list[index]) / span : 0
    return Math.min(index + Math.min(Math.max(ratio, 0), 1), list.length - 1)
  }

  const tick = (now: number) => {
    if (!store.playing) {
      handle = null
      return
    }
    const last = timeList[timeList.length - 1]
    const gpsMs = baseGpsMs + (now - baseNow) * store.speed
    if (Number.isFinite(last) && gpsMs >= last) {
      store.setCursor(store.maxCursor)
      store.playing = false
      handle = null
      return
    }
    store.setCursor(locate(gpsMs, timeList))
    handle = requestAnimationFrame(tick)
  }

  /**
   * 游标对应的 gps 时间：按浮点索引在相邻两帧间插值。
   * 直接用 floor(cursor) 取整会丢掉段内进度，导致暂停后再次播放退回到本段起点。
   */
  const timeAtCursor = () => {
    if (!timeList.length) return Number.NaN
    const clamped = Math.min(Math.max(store.cursor, 0), timeList.length - 1)
    const lower = Math.floor(clamped)
    const next = Math.min(lower + 1, timeList.length - 1)
    const ratio = clamped - lower
    return timeList[lower] + (timeList[next] - timeList[lower]) * ratio
  }

  /** 从当前游标重新计时，避免倍速切换或拖拽后时间基准错位。 */
  const rebase = () => {
    if (!timeList.length) timeList = times()
    baseGpsMs = timeAtCursor()
    baseNow = performance.now()
  }

  const play = () => {
    if (!store.points.length || store.playing) return
    if (store.cursor >= store.maxCursor) store.setCursor(0)
    timeList = times()
    rebase()
    if (!Number.isFinite(baseGpsMs)) return
    store.playing = true
    handle = requestAnimationFrame(tick)
  }

  const pause = () => {
    store.playing = false
    stopFrame()
  }

  const toggle = () => (store.playing ? pause() : play())

  watch(
    () => store.speed,
    () => {
      if (store.playing) rebase()
    },
  )

  onUnmounted(stopFrame)

  return { play, pause, toggle, dispose: stopFrame }
}
