import router from '@/router'
import { ROUTE_NAMES } from '@/router/constants'
import { parseSharedMapStage, SEAT_SHARED_STATE_KEY } from './seatSharedState'
import { usePendingCallLocationStore } from '@/store/usePendingCallLocationStore'

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
    const condition = value?.condition ?? value?.pageState ?? value?.value
    return isPageCondition(condition) ? condition : null
  } catch {
    return null
  }
}

const routeForCondition = (condition: PageCondition) =>
  condition === PAGE_CONDITION.DISPATCH
    ? ROUTE_NAMES.DISPATCH
    : ROUTE_NAMES.MAP

/** 特灾模式（mode=flood）：所有切页操作一律拦截，留在特殊地图 */
const isFloodMode = (): boolean => {
  try {
    const state = JSON.parse(localStorage.getItem(SEAT_SHARED_STATE_KEY) ?? 'null')
    return state?.mode === 'flood'
  } catch {
    return false
  }
}

export const navigateByCondition = async (condition: PageCondition) => {
  // 特灾模式：不切页，留在特殊地图
  if (isFloodMode()) return
  const routeName = routeForCondition(condition)
  if (router.currentRoute.value.name === routeName) return

  try {
    await router.replace({ name: routeName })
    console.info('[page-condition] 页面状态已切换', condition, routeName)
  } catch (error) {
    console.error('[page-condition] 页面状态切换失败', condition, error)
  }
}

export const setPageCondition = (
  condition: PageCondition,
  source = 'ids-gis-web',
) => {
  localStorage.setItem(PAGE_CONDITION_STORAGE_KEY, JSON.stringify({
    condition,
    updatedAt: Date.now(),
    source,
  }))
  return navigateByCondition(condition)
}

export const clearPageCondition = () => {
  localStorage.removeItem(PAGE_CONDITION_STORAGE_KEY)
}

/**
 * 监听同域主屏写入的页面状态。
 * 只处理启动后发生的状态变化，不重放 localStorage 中上一次的业务状态。
 * 初始页面由路由决定，避免刷新地图时被旧 DispatchCondition 拉回调派页。
 */
export const initPageConditionListener = () => {
  let disposed = false

  const apply = (raw: string | null) => {
    if (disposed) return
    const condition = parsePageCondition(raw)
    if (condition) void navigateByCondition(condition)
  }

  const onStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return
    if (event.key === SEAT_SHARED_STATE_KEY) {
      if (disposed) return
      // 特灾模式（mode=flood）：不响应 phase 切换，留在特殊地图
      try {
        const state = JSON.parse(event.newValue ?? 'null')
        if (state?.mode === 'flood') return
      } catch { /* 解析失败走正常流程 */ }
      const stage = parseSharedMapStage(event.newValue)
      if (!stage) return
      console.info('[seat-shared-state] 地图业务状态', stage)
      // 切页前清除旧来电缓存：值守地图可能在该 storage 事件后才挂载，
      // 单靠地图组件内的监听会错过事件并把粗定位圈重新绘制出来。
      if (stage === 'onDuty') usePendingCallLocationStore().consume()
      void navigateByCondition(
        stage === 'dispatch' || stage === 'dispatchTrack'
          ? PAGE_CONDITION.DISPATCH : PAGE_CONDITION.REQUEST,
      )
      return
    }
    if (event.key !== PAGE_CONDITION_STORAGE_KEY) return
    apply(event.newValue)
  }

  window.addEventListener('storage', onStorage)

  return () => {
    disposed = true
    window.removeEventListener('storage', onStorage)
  }
}
