/**
 * 受理席共享状态 Store —— seat 共享键的唯一接收方。
 * 监听的 localStorage 键（由 ids-seat-web 写入）：
 *   - seat-shared-state        auth.* / user.* / seat.* / phase / currentAlarm / mode
 *   - seat-auth-session        accessToken 兜底
 *   - seat-shared-state-mock   F10 模拟业务原始报文
 *   - seat-store               userSeatStatus
 *   - seat_id / seat_ip        座席号与 IP
 *
 * 本文件只做「接收 + 归一 + 派生」，不含业务判断：
 * 业务语义转换见 utils/seatSharedState，请求凭证见 service/authHeaders。
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { sharedMessageSessionFromSnapshot } from '@/utils/seatSharedState'
import type {
  MapPhase,
  SharedMessageSession,
  SharedState,
  SharedUser,
} from '@/controller/core/protocol/SharedStateProtocol'

export type { MapPhase } from '@/controller/core/protocol/SharedStateProtocol'
export type User = SharedUser

export interface Session {
  sessionId: string
  userId: string
  accessToken: string
}

/* ============================ 默认监听常量 ============================ */

const STORAGE_KEYS = {
  SEAT_SHARED_STATE: 'seat-shared-state',
  SEAT_SHARED_STATE_MOCK: 'seat-shared-state-mock',
  SEAT_AUTH_SESSION: 'seat-auth-session',
  SEAT_STORE: 'seat-store',
  SEAT_ID: 'seat_id',
  SEAT_IP: 'seat_ip',
} as const

/* ============================ 纯工具 ============================ */

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const tryJson = (raw: string | null): Record<string, unknown> | null => {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    return isObject(value) ? value : null
  } catch {
    return null
  }
}

const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim()

/** 会话边界标识：用户 / 会话 / 席位任一变化即视为新会话。 */
const sessionIdentity = (shared: SharedState | null) => {
  if (shared?.auth === null) return 'loggedOut'
  if (!isObject(shared?.auth)) return null
  return JSON.stringify([
    nonempty(shared?.user?.userId) ? shared.user.userId : null,
    nonempty(shared.auth.sessionId) ? shared.auth.sessionId : null,
    nonempty(shared?.seat?.seatNumber) ? shared.seat.seatNumber.trim() : null,
  ])
}

/* ============================ Store ============================ */

export const useUserStore = defineStore('ids_user', () => {
  /* -------- 身份与凭证 -------- */
  const currentUser = ref<User | null>(null)
  const session = ref<Session | null>(null)

  /* -------- 座席信息 -------- */
  const seatStatus = ref<string | null>(null)
  const seatId = ref<string | null>(null)
  const seatIp = ref<string | null>(null)
  const seatNumber = ref<string | null>(null)

  /* -------- 地图业务态（原始快照，不做派生投影） -------- */
  const MapMode = ref<MapPhase>('onDuty')
  const rawState = shallowRef<SharedState | null>(null)
  const currentAlarm = shallowRef<SharedState['currentAlarm']>(undefined)
  const mode = ref<SharedState['mode']>(undefined)

  /* -------- 接收版本与失效标识 -------- */
  const sharedStateRevision = ref(0)
  const lastSharedReceiveAt = ref(0)
  const mockRevision = ref(0)
  const sessionEpoch = ref(0)

  /* -------- F10 模拟业务原始报文（store 不解析业务字段） -------- */
  const seatSharedStateMockRaw = ref<string | null>(null)

  /** seat-auth-session 的兜底 token：仅主共享键缺 token 时生效。 */
  let fallbackAccessToken: string | null = null

  const sessionScope = () => JSON.stringify([sessionIdentity(rawState.value), session.value !== null])

  /** 每次完整接收后递增 revision，并记录到达时刻。 */
  const commitSharedReceive = () => {
    lastSharedReceiveAt.value = Date.now()
    sharedStateRevision.value += 1
  }

  /** 由共享快照 + 兜底 token 合成完整会话；必需项缺失即为未登录。 */
  const updateSession = () => {
    const shared = rawState.value
    const auth = shared?.auth
    const sharedUserId = shared?.user?.userId
    const token = nonempty(auth?.accessToken) ? auth.accessToken : fallbackAccessToken
    session.value =
      isObject(auth) && nonempty(sharedUserId) && nonempty(auth.sessionId) && token
        ? { userId: sharedUserId, sessionId: auth.sessionId, accessToken: token }
        : null
  }

  /** 接收 seat-shared-state：整体替换身份与地图业务态。 */
  const applySharedState = (raw: string | null) => {
    const shared = tryJson(raw) as SharedState | null
    const previousScope = sessionScope()
    rawState.value = shared
    MapMode.value = shared?.phase ?? 'onDuty'
    currentAlarm.value = shared?.currentAlarm
    mode.value = shared?.mode
    currentUser.value = isObject(shared?.user) ? shared.user : null
    seatNumber.value = typeof shared?.seat?.seatNumber === 'string' ? shared.seat.seatNumber : null
    updateSession()
    if (previousScope !== sessionScope()) sessionEpoch.value += 1
    commitSharedReceive()
  }

  /** 接收 seat-shared-state-mock：只存原始报文，由 F10 桥解析。 */
  const applyMockState = (raw: string | null) => {
    seatSharedStateMockRaw.value = raw
    mockRevision.value += 1
  }

  /** 接收 seat-auth-session：只更新兜底 token，不动地图业务态。 */
  const applyAuthSession = (raw: string | null, commit = true) => {
    const token = tryJson(raw)?.accessToken
    fallbackAccessToken = nonempty(token) ? token : null
    if (!commit) return
    const previousToken = session.value?.accessToken ?? null
    const previousScope = sessionScope()
    updateSession()
    if (previousToken === (session.value?.accessToken ?? null)) return
    if (previousScope !== sessionScope()) sessionEpoch.value += 1
    commitSharedReceive()
  }

  /** localStorage.clear()：所有键一次性归零，不留半快照。 */
  const clearStorageState = () => {
    fallbackAccessToken = null
    seatStatus.value = null
    seatId.value = null
    seatIp.value = null
    seatSharedStateMockRaw.value = null
    applySharedState(null)
    mockRevision.value += 1
  }

  /* -------- 派生只读字段 -------- */

  const isLoggedIn = computed(() => !!session.value?.accessToken && !!currentUser.value)
  const accessToken = computed(() => session.value?.accessToken ?? null)
  const sessionId = computed(() => session.value?.sessionId ?? null)
  const userId = computed(() => currentUser.value?.userId ?? null)
  const username = computed(() => currentUser.value?.username ?? '')
  const tenantId = computed(() => {
    const value = rawState.value?.auth?.Tenantid
    return typeof value === 'string' && value.trim() ? value.trim() : null
  })
  const traceId = computed(() => {
    const value = rawState.value?.auth?.['X-Trace-Id']
    return typeof value === 'string' && value.trim() ? value.trim() : null
  })
  /** 消息服务 V2 的会话身份（不含 token）。 */
  const messageSession = computed<SharedMessageSession | null>(() => sharedMessageSessionFromSnapshot(rawState.value))

  return {
    // 身份与座席
    currentUser,
    session,
    seatStatus,
    seatId,
    seatIp,
    seatNumber,
    MapMode,
    // 地图业务态与接收版本
    rawState,
    currentAlarm,
    mode,
    sharedStateRevision,
    lastSharedReceiveAt,
    seatSharedStateMockRaw,
    mockRevision,
    sessionEpoch,
    // 接收动作
    applySharedState,
    applyMockState,
    applyAuthSession,
    clearStorageState,
    // 派生只读
    isLoggedIn,
    accessToken,
    sessionId,
    userId,
    username,
    tenantId,
    traceId,
    messageSession,
  }
})

/* ============================ 初始化与 storage 监听 ============================ */

type StorageHandlers = Record<string, (newValue: string | null) => void>

const registrations = new WeakMap<
  ReturnType<typeof useUserStore>,
  {
    observers: Set<StorageHandlers>
    dispose: () => void
  }
>()

export const initUserStore = (handlers: StorageHandlers = {}) => {
  const store = useUserStore()
  const existing = registrations.get(store)
  if (existing) {
    existing.observers.add(handlers)
    return existing.dispose
  }
  const observers = new Set([handlers])
  const defaults: StorageHandlers = {
    [STORAGE_KEYS.SEAT_AUTH_SESSION]: store.applyAuthSession,
    [STORAGE_KEYS.SEAT_SHARED_STATE]: store.applySharedState,
    [STORAGE_KEYS.SEAT_SHARED_STATE_MOCK]: store.applyMockState,
    [STORAGE_KEYS.SEAT_STORE]: (raw) => {
      const status = tryJson(raw)?.userSeatStatus
      store.seatStatus = typeof status === 'string' ? status : null
    },
    [STORAGE_KEYS.SEAT_ID]: (raw) => {
      store.seatId = nonempty(raw) ? raw : null
    },
    [STORAGE_KEYS.SEAT_IP]: (raw) => {
      store.seatIp = nonempty(raw) ? raw : null
    },
  }
  let disposed = false
  const notify = (key: string, raw: string | null) => {
    for (const observer of observers) {
      try {
        observer[key]?.(raw)
      } catch {}
    }
  }
  const onStorage = (event: StorageEvent) => {
    if (disposed || event.storageArea !== localStorage) return
    if (event.key === null) {
      store.clearStorageState()
      const keys = new Set([...Object.keys(defaults), ...[...observers].flatMap((observer) => Object.keys(observer))])
      keys.forEach((key) => notify(key, null))
      return
    }
    defaults[event.key]?.(event.newValue)
    notify(event.key, event.newValue)
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    window.removeEventListener('storage', onStorage)
    observers.clear()
    registrations.delete(store)
  }
  registrations.set(store, { observers, dispose })
  window.addEventListener('storage', onStorage)
  const keys = new Set([...Object.keys(defaults), ...Object.keys(handlers)])
  const initial = new Map([...keys].map((key) => [key, localStorage.getItem(key)]))
  for (const [key, handler] of Object.entries(defaults)) {
    const raw = initial.get(key) ?? null
    if (key === STORAGE_KEYS.SEAT_AUTH_SESSION) {
      store.applyAuthSession(raw, false)
      continue
    }
    if (key !== STORAGE_KEYS.SEAT_SHARED_STATE_MOCK || raw !== null) handler(raw)
  }
  keys.forEach((key) => notify(key, initial.get(key) ?? null))
  return dispose
}
