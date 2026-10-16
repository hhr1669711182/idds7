import { watch } from 'vue'
import router from '@/router'
import { ROUTE_NAMES } from '@/router/constants'
import { getSharedMapStage } from '@/utils/seatSharedState'
import { usePendingCallLocationStore } from '@/store/usePendingCallLocationStore'
import { useUserStore } from '@/store/useUserStore'
import { createLogger } from '@/utils/logger'

const logger = createLogger('page-condition')

export const PAGE_CONDITION_STORAGE_KEY = 'ids-gis:page-condition'

export const PAGE_CONDITION = {
  REQUEST: 'RequestCondition',
  DISPATCH: 'DispatchCondition',
} as const

export type PageCondition = (typeof PAGE_CONDITION)[keyof typeof PAGE_CONDITION]

const isPageCondition = (value: unknown): value is PageCondition =>
  value === PAGE_CONDITION.REQUEST || value === PAGE_CONDITION.DISPATCH

export const parsePageCondition = (raw: string | null): PageCondition | null => {
  if (!raw) return null
  if (isPageCondition(raw)) return raw
  try {
    const value = JSON.parse(raw)
    const condition: unknown = value?.condition ?? value?.pageState ?? value?.value
    return isPageCondition(condition) ? condition : null
  } catch {
    return null
  }
}

type UserStore = ReturnType<typeof useUserStore>

const isSpecialNavigationAllowed = (store: UserStore) =>
  store.mode === 'flood' && store.rawState?.auth !== null && store.MapMode !== 'loggedOut'

interface NavigationState {
  pending?: { condition: PageCondition; epoch: number; special: boolean }
  running?: Promise<void>
}

const navigations = new WeakMap<UserStore, NavigationState>()
const listeners = new WeakMap<UserStore, () => void>()

const navigationFor = (store: UserStore) => {
  let state = navigations.get(store)
  if (!state) {
    state = {}
    navigations.set(store, state)
  }
  return state
}

const queueNavigation = (condition: PageCondition, special: boolean): Promise<void> => {
  const store = useUserStore()
  const state = navigationFor(store)
  const allowed = special ? isSpecialNavigationAllowed(store) : store.mode !== 'flood'
  if (!allowed) {
    if (state.pending?.special === special) state.pending = undefined
    return Promise.resolve()
  }
  state.pending = { condition, epoch: store.sessionEpoch, special }
  if (state.running) return state.running
  state.running = Promise.resolve().then(async () => {
    while (state.pending) {
      const intent = state.pending
      state.pending = undefined
      if (intent.epoch !== store.sessionEpoch) continue
      if (intent.special ? !isSpecialNavigationAllowed(store) : store.mode === 'flood') continue
      const routeName = intent.condition === PAGE_CONDITION.DISPATCH ? ROUTE_NAMES.DISPATCH1 : ROUTE_NAMES.MAP
      if (router.currentRoute.value.name === routeName) continue
      try {
        await router.replace({ name: routeName })
      } catch (error) {
        logger.error('页面状态切换失败', { condition: intent.condition, error })
      }
    }
    state.running = undefined
  })
  return state.running
}

export const navigateByCondition = (condition: PageCondition): Promise<void> => queueNavigation(condition, false)

export const requestSpecialMapNavigation = (): Promise<void> => queueNavigation(PAGE_CONDITION.DISPATCH, true)

export const setPageCondition = (condition: PageCondition, source = 'ids-gis-web') => {
  localStorage.setItem(PAGE_CONDITION_STORAGE_KEY, JSON.stringify({ condition, updatedAt: Date.now(), source }))
  return navigateByCondition(condition)
}

export const requestPageCondition = (condition: PageCondition, source = 'ids-gis-web') =>
  setPageCondition(condition, source)

export const clearPageCondition = () => {
  localStorage.removeItem(PAGE_CONDITION_STORAGE_KEY)
}

export const initPageConditionListener = () => {
  const store = useUserStore()
  const existing = listeners.get(store)
  if (existing) return existing
  let disposed = false
  const stopShared = watch(
    () => store.sharedStateRevision,
    () => {
      if (disposed) return
      const stage = getSharedMapStage(store.rawState, store.MapMode)
      if (!stage || store.mode === 'flood') {
        const state = navigationFor(store)
        if (!isSpecialNavigationAllowed(store) || !state.pending?.special || state.pending.epoch !== store.sessionEpoch)
          state.pending = undefined
        return
      }
      if (stage === 'onDuty') usePendingCallLocationStore().consume()
      void navigateByCondition(
        stage === 'dispatch' || stage === 'dispatchTrack' ? PAGE_CONDITION.DISPATCH : PAGE_CONDITION.REQUEST,
      )
    },
    { flush: 'sync' },
  )
  const onStorage = (event: StorageEvent) => {
    if (disposed || event.storageArea !== localStorage || event.key !== PAGE_CONDITION_STORAGE_KEY) return
    const condition = parsePageCondition(event.newValue)
    if (condition) void navigateByCondition(condition)
  }
  window.addEventListener('storage', onStorage)
  const dispose = () => {
    if (disposed) return
    disposed = true
    stopShared()
    window.removeEventListener('storage', onStorage)
    navigationFor(store).pending = undefined
    listeners.delete(store)
  }
  listeners.set(store, dispose)
  return dispose
}
