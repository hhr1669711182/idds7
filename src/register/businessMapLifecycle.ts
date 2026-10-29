import type { Router, RouteLocationNormalized } from 'vue-router'
import type { BusinessMessageRuntime } from '@/controller/core/io/BusinessMessageRuntime'
import { ROUTE_NAMES } from '@/router/constants'

export const bindBusinessMapLifecycle = (router: Router, runtime: BusinessMessageRuntime): (() => void) => {
  const dispatchNames = [ROUTE_NAMES.DISPATCH]
  const pending = new WeakMap<RouteLocationNormalized, () => void>()
  const stopBefore = router.beforeEach((to, from) => {
    if (dispatchNames.some((name) => name === from.name) && !dispatchNames.some((name) => name === to.name)) {
      pending.set(to, runtime.prepareDispatchLeave())
    }
  })
  const stopAfter = router.afterEach((to, _from, failure) => {
    const leave = pending.get(to)
    pending.delete(to)
    if (!failure) leave?.()
  })
  return () => {
    stopBefore()
    stopAfter()
  }
}
