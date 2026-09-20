/**
 * 用户会话 Store
 * 同步同源共享 localStorage 中由 ids-seat-web 写入的数据：
 *   - seat-shared-state        auth.accessToken / auth.sessionId / user.* / phase
 *   - seat-auth-session        accessToken 兜底
 *   - seat-store               userSeatStatus
 *   - seat_id                  座席号
 *   - seat_ip                  座席IP
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface User {
  userId?: string
  username?: string
  displayName?: string
  employeeNo?: string
  orgId?: string
  orgName?: string
  roles?: string[]
}

export interface Session {
  sessionId: string
  userId: string
  accessToken: string
}

export type MapPhase = 'loggedOut' | 'onDuty' | 'popup' | 'inquiry' | 'dispatch'

// 本地存储键名实时监听配置
const STORAGE_KEYS = {
  SEAT_SHARED_STATE: 'seat-shared-state',
  SEAT_AUTH_SESSION: 'seat-auth-session',
  SEAT_STORE: 'seat-store',
  SEAT_ID: 'seat_id',
  SEAT_IP: 'seat_ip',
} as const

interface SharedState {
  auth?: { accessToken?: string; sessionId?: string }
  user?: Partial<User>
  seat?: { seatNumber: string; terminalId: string }
  phase?: MapPhase
}

interface AuthSession {
  accessToken?: string
  lastUsername?: string
  tenantId?: string
}

interface SeatStore {
  userSeatStatus?: string
}

const tryJson = <T,>(raw: string | null): T | null => {
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export const useUserStore = defineStore('ids_user', () => {
  const currentUser = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const seatStatus = ref<string | null>(null)
  const seatId = ref<string | null>(null) // 天润软交换
  const seatIp = ref<string | null>(null)
  const seatNumber = ref<string | null>(null)
  const MapMode = ref<MapPhase>('onDuty')

  const isLoggedIn = computed(() => !!session.value?.accessToken && !!currentUser.value)
  const accessToken = computed(() => session.value?.accessToken ?? null)
  const sessionId = computed(() => session.value?.sessionId ?? null)
  const userId = computed(() => currentUser.value?.userId ?? null)
  const username = computed(() => currentUser.value?.username ?? '')

  return {
    currentUser,
    session,
    seatStatus,
    seatId,
    seatIp,
    seatNumber,
    MapMode,
    isLoggedIn,
    accessToken,
    sessionId,
    userId,
    username,
  }
})

const applySharedState = (raw: string | null) => {
  const shared = tryJson<SharedState>(raw)
  const store = useUserStore()

  store.MapMode = shared?.phase ?? 'onDuty'
  store.currentUser = shared?.user ?? null
  store.seatNumber = shared?.seat?.seatNumber ?? null

  const { accessToken, sessionId } = shared?.auth ?? {}
  store.session = accessToken
    ? { sessionId: sessionId ?? '', userId: shared?.user?.userId ?? '', accessToken }
    : null
}

const applyAuthSession = (raw: string | null) => {
  const data = tryJson<AuthSession>(raw)
  const store = useUserStore()
  if (!data?.accessToken || store.accessToken) return
  // seat-auth-session 仅作为 accessToken 的兜底；其它字段不影响现有 session
  store.session = { ...store.session!, accessToken: data.accessToken }
}

const applySeatStore = (raw: string | null) => {
  useUserStore().seatStatus = tryJson<SeatStore>(raw)?.userSeatStatus ?? null
}

const applySeatId = (raw: string | null) => {
  useUserStore().seatId = raw && raw.trim() ? raw : null
}

const applySeatIp = (raw: string | null) => {
  useUserStore().seatIp = raw && raw.trim() ? raw : null
}

// 默认监听函数配置
const DEFAULT_HANDLERS: Record<string, (newValue: string | null) => void> = {
  [STORAGE_KEYS.SEAT_SHARED_STATE]: applySharedState,
  [STORAGE_KEYS.SEAT_AUTH_SESSION]: applyAuthSession,
  [STORAGE_KEYS.SEAT_STORE]: applySeatStore,
  [STORAGE_KEYS.SEAT_ID]: applySeatId,
  [STORAGE_KEYS.SEAT_IP]: applySeatIp,
}

/**
 * 注册 storage 变更监听并按 key 分发到对应处理函数。
 * handlers 与默认监听合并：传入的同名 key 覆盖默认；未在传入中的 key 仍按默认监听。
 * 返回 dispose 函数。
 */
export const initUserStore = (
  handlers: Record<string, (newValue: string | null) => void> = {},
) => {
  const merged = { ...DEFAULT_HANDLERS, ...handlers }
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return
    if (!event.key) {
      for (const key of Object.keys(merged)) merged[key](null)
      return
    }
    const handler = merged[event.key]
    if (handler) handler(event.newValue)
  }

  window.addEventListener('storage', onStorage)

  for (const [key, handler] of Object.entries(merged)) {
    handler(localStorage.getItem(key))
  }

  return () => window.removeEventListener('storage', onStorage)
}
