import type { RouteLocationRaw, RouteRecordNameGeneric } from 'vue-router'
import { getSharedMapStage } from '@/utils/seatSharedState'
import { useUserStore } from '@/store/useUserStore'
import { ROUTE_NAMES } from './constants'

export const getSharedStateRedirect = (
  routeName: RouteRecordNameGeneric,
  store = useUserStore(),
): RouteLocationRaw | undefined => {
  if (store.mode === 'flood' && store.rawState?.auth !== null && store.MapMode !== 'loggedOut') {
    if (routeName !== ROUTE_NAMES.DISPATCH1) return { name: ROUTE_NAMES.DISPATCH1, replace: true }
    return
  }
  if (routeName !== ROUTE_NAMES.DISPATCH1) return
  const stage = getSharedMapStage(store.rawState, store.MapMode)
  if (stage !== 'dispatch' && stage !== 'dispatchTrack') return { name: ROUTE_NAMES.MAP, replace: true }
}
