import type { RouteLocationRaw, RouteRecordNameGeneric } from 'vue-router'
import { getSharedMapStage } from '@/utils/seatSharedState'
import { useUserStore } from '@/store/useUserStore'
import { ROUTE_NAMES } from './constants'

/**
 * 合并归一（路线 X）后：/dispatch 已退化为 thin redirect → /map，flood 不再跳路由。
 * 调派业务态由 home.vue 内 isDispatchVariant 派生切换包装层承载，守卫只保留
 * "刷新停留在调派 stage 时不弹回 MAP" 的兜底，避免 /dispatch 残留 URL 死循环。
 * flood 分支已删除（flood 改在 /map 内按 variant 显示调派 UI，不再强制导航）。
 */
export const getSharedStateRedirect = (
  routeName: RouteRecordNameGeneric,
  store = useUserStore(),
): RouteLocationRaw | undefined => {
  if (routeName !== ROUTE_NAMES.DISPATCH) return
  const stage = getSharedMapStage(store.rawState, store.MapMode)
  if (stage !== 'dispatch' && stage !== 'dispatchTrack') return { name: ROUTE_NAMES.MAP, replace: true }
}
