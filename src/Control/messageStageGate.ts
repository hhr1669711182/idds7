import { MESSAGE_EVENT_KEY } from '@/const/const.message.type'
import { parseSharedMapStage, SEAT_SHARED_STATE_KEY, type SharedMapStage } from './seatSharedState'

const stages: Record<string, SharedMapStage> = {
  [MESSAGE_EVENT_KEY.MAP_LOCATE_CALL]: 'popup',
  [MESSAGE_EVENT_KEY.ALARM_CALL_ANSWER_STATUS_CHANGED]: 'inquiry',
  [MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED]: 'dispatch',
  [MESSAGE_EVENT_KEY.ALARM_PROFILE_SYNC]: 'dispatch',
  // 警情定位仅在问询且已立案（inquiry + incidentId 非空，投影为 dispatch）时处理；
  // 进入 dispatchTrack 调派阶段后状态不匹配，消息将被门控忽略。
  [MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED]: 'dispatch',
  [MESSAGE_EVENT_KEY.TRACKING_VEHICLE_GPS_UPDATE]: 'dispatchTrack',
}

/** 收到消息后至少等待 500ms；共享状态每次变化重新计算稳定窗口。 */
export function createMessageStageGate(options: {
  read?: () => string | null
  now?: () => number
} = {}) {
  const read = options.read ?? (() => localStorage.getItem(SEAT_SHARED_STATE_KEY))
  const now = options.now ?? Date.now
  let raw = read()
  let changedAt = now()
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Array<{ eventKey: string; receivedAt: number; deliver: () => void }> = []
  const observe = () => {
    const next = read()
    if (next !== raw) { raw = next; changedAt = now() }
  }
  const tick = () => {
    timer = undefined
    if (disposed) return
    observe()
    const ready = pending.filter(item => now() - Math.max(item.receivedAt, changedAt) >= 500)
    pending = pending.filter(item => !ready.includes(item))
    for (const item of ready) {
      if (disposed) break
      const stage = parseSharedMapStage(raw)
      if (stage === stages[item.eventKey]) item.deliver()
      else console.info('[message-stage] 忽略状态不匹配的消息', { eventKey: item.eventKey, stage })
    }
    if (pending.length && !disposed) timer = setTimeout(tick, 25)
  }
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === localStorage && (event.key === SEAT_SHARED_STATE_KEY || event.key === null)) {
      // 即使多个写入最终恢复为同一值，也必须重新等待稳定窗口。
      raw = read()
      changedAt = now()
    }
  }
  window.addEventListener('storage', onStorage)
  return {
    accept(eventKey: string, deliver: () => void) {
      if (disposed) return
      if (!stages[eventKey]) { deliver(); return }
      observe()
      pending.push({ eventKey, deliver, receivedAt: now() })
      if (timer === undefined) timer = setTimeout(tick, 25)
    },
    dispose() {
      disposed = true
      if (timer !== undefined) clearTimeout(timer)
      pending = []
      window.removeEventListener('storage', onStorage)
    },
  }
}
