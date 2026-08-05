import type { Router } from 'vue-router'
import { loadAndRegisterDynamicRoutes } from '../dynamic'

const enableDynamicRoutes = () => import.meta.env.VITE_ENABLE_DYNAMIC_ROUTES === 'true'

export const setupDynamicRouteGuard = (router: Router) => {
  let loaded = false
  let loading: Promise<unknown> | null = null

  router.beforeEach(async (to) => {
    if (!enableDynamicRoutes() || loaded) return true

    loading ??= loadAndRegisterDynamicRoutes(router)
      .then(() => {
        loaded = true
      })
      .catch((error) => {
        console.warn('[router] Failed to load dynamic routes', error)
        loaded = true
      })
      .finally(() => {
        loading = null
      })

    await loading

    return {
      path: to.path,
      query: to.query,
      hash: to.hash,
      replace: true,
    }
  })
}
