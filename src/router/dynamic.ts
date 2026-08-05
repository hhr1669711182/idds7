import type { RouteRecordRaw, Router } from 'vue-router'
import MainLayout from '@/layout/MainLayout.vue'
import { fetchBackendRoutes, type BackendRouteRecord } from '@/apis/router'
import { ROUTE_NAMES } from './constants'

const viewModules = import.meta.glob('../views/**/*.vue')
const dynamicRouteRemovers: Array<() => void> = []

const componentAliasMap: Record<string, RouteRecordRaw['component']> = {
  Layout: MainLayout,
  MainLayout,
  home: () => import('@/views/home.vue'),
  'test/index': () => import('@/views/test/index.vue'),
  region: () => import('@/views/region.vue'),
  building: () => import('@/views/building.vue'),
  three_platform: () => import('@/views/three_platform.vue'),
}

const normalizeComponentPath = (component: string) =>
  component
    .replace(/^@\/views\//, '')
    .replace(/^\/?src\/views\//, '')
    .replace(/^\/?views\//, '')
    .replace(/\.vue$/, '')
    .replace(/^\/+|\/+$/g, '')

const resolveRouteComponent = (component?: string): RouteRecordRaw['component'] | undefined => {
  if (!component) return undefined
  if (componentAliasMap[component]) return componentAliasMap[component]

  const normalized = normalizeComponentPath(component)
  const candidates = [
    `../views/${normalized}.vue`,
    `../views/${normalized}/index.vue`,
  ]

  const matchedPath = candidates.find((path) => viewModules[path])
  return matchedPath ? viewModules[matchedPath] : undefined
}

const normalizeDynamicPath = (path: string) => path.replace(/^\/+/, '')

const toRouteRecord = (record: BackendRouteRecord): RouteRecordRaw | null => {
  const component = resolveRouteComponent(record.component)

  if (!component && !record.children?.length) {
    console.warn(`[router] Dynamic route "${record.name}" missing component: ${record.component}`)
    return null
  }

  const children = record.children
    ?.map(toRouteRecord)
    .filter((route): route is RouteRecordRaw => !!route)

  const baseRoute = {
    path: normalizeDynamicPath(record.path),
    name: record.name,
    ...(record.redirect ? { redirect: record.redirect } : null),
    ...(record.meta ? { meta: record.meta } : null),
  }

  if (children?.length) {
    return {
      ...baseRoute,
      component: component ?? MainLayout,
      children,
    } as RouteRecordRaw
  }

  return {
    ...baseRoute,
    component: component!,
  } as RouteRecordRaw
}

export const transformBackendRoutes = (records: BackendRouteRecord[]) =>
  records
    .map(toRouteRecord)
    .filter((route): route is RouteRecordRaw => !!route)

export const unregisterDynamicRoutes = () => {
  while (dynamicRouteRemovers.length) {
    dynamicRouteRemovers.pop()?.()
  }
}

export const registerDynamicRoutes = (
  router: Router,
  records: BackendRouteRecord[],
  parentName: string = ROUTE_NAMES.ROOT,
) => {
  unregisterDynamicRoutes()

  const routes = transformBackendRoutes(records)
  routes.forEach((route) => {
    if (route.name && router.hasRoute(route.name)) {
      router.removeRoute(route.name)
    }

    dynamicRouteRemovers.push(router.addRoute(parentName, route))
  })

  return routes
}

export const loadAndRegisterDynamicRoutes = async (
  router: Router,
  parentName: string = ROUTE_NAMES.ROOT,
) => {
  const backendRoutes = await fetchBackendRoutes()
  return registerDynamicRoutes(router, backendRoutes, parentName)
}
