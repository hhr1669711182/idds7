import type { AmapDrivingResult, LngLat } from './useAmapTools'
import type { RouteMetrics } from './routeMetrics'
import type { RoutePlan, RouteResult } from '@/apis/amap'

export type RoutePreference = 'fastest' | 'shortest' | 'balanced'
export const ROUTE_PREFERENCE_LABELS: Record<RoutePreference, string> = {
  fastest: '时间最短',
  shortest: '距离最短',
  balanced: '综合推荐',
}
export type RouteAlternative = {
  id: string
  preferences: RoutePreference[]
  result: AmapDrivingResult
  metrics: RouteMetrics
  etaSeconds: number
}
export type StationRouteAlternatives = {
  stationId: string
  stationName: string
  origin: LngLat
  destination: LngLat
  alternatives: RouteAlternative[]
  selectedId: string
  /** 用户点击路线后才高亮描边；默认选中的路线仍使用白色描边。 */
  manualSelected?: boolean
  error?: string
}

const isRoutePlan = (value: unknown): value is RoutePlan => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RoutePlan>
  return Array.isArray(candidate.features) && candidate.totalTime !== undefined && candidate.totalDistance !== undefined
}

const isRouteResult = (value: unknown): value is RouteResult =>
  !!value && typeof value === 'object' && Array.isArray((value as RouteResult).routes)

/**
 * 兼容代理返回 RoutePlan[]、RouteResult、RouteResult[] 或再次包裹 data 的形状。
 * 当前代理的 /route/driving 会直接把高德 paths 转为 RoutePlan[]。
 */
export const normalizeRouteResults = (response: unknown): RouteResult[] => {
  if (Array.isArray(response)) {
    const results = response.filter(isRouteResult)
    const plans = response.filter(isRoutePlan)
    return plans.length ? [...results, { routes: plans }] : results
  }
  if (!response || typeof response !== 'object') return []
  if (isRoutePlan(response)) return [{ routes: [response] }]
  const candidate = response as { routes?: unknown; data?: unknown }
  if (isRouteResult(candidate)) return [candidate]
  return candidate.data === response ? [] : normalizeRouteResults(candidate.data)
}

/** 保留所有有效且不同的高德路径；三个偏好标签只用于标识对应的最优方案。 */
export const selectRouteAlternatives = (results: AmapDrivingResult[]) => {
  const unique = new Map<string, AmapDrivingResult>()
  results.forEach((result) => {
    if (
      result.fullPath.length < 2 ||
      !Number.isFinite(result.durationSeconds) ||
      result.durationSeconds <= 0 ||
      !Number.isFinite(result.distanceMeters) ||
      result.distanceMeters <= 0
    )
      return
    const key = JSON.stringify(result.fullPath)
    const previous = unique.get(key)
    if (!previous || result.durationSeconds < previous.durationSeconds) unique.set(key, result)
  })
  const routes = [...unique.values()]
  if (!routes.length) return []
  const fastest = routes.reduce((a, b) => (b.durationSeconds < a.durationSeconds ? b : a))
  const shortest = routes.reduce((a, b) => (b.distanceMeters < a.distanceMeters ? b : a))
  const score = (r: AmapDrivingResult) =>
    (r.durationSeconds / fastest.durationSeconds - 1) ** 2 + (r.distanceMeters / shortest.distanceMeters - 1) ** 2
  const balanced = routes.reduce((a, b) => (score(b) < score(a) ? b : a))
  const selected: { id: string; preferences: RoutePreference[]; result: AmapDrivingResult }[] = []
  ;(
    [
      ['fastest', fastest],
      ['shortest', shortest],
      ['balanced', balanced],
    ] as const
  ).forEach(([preference, result]) => {
    const existing = selected.find((item) => item.result === result)
    if (existing) existing.preferences.push(preference)
    else selected.push({ id: preference, preferences: [preference], result })
  })
  routes.forEach((result, index) => {
    if (!selected.some((item) => item.result === result)) {
      selected.push({ id: `alternative-${index + 1}`, preferences: [], result })
    }
  })
  return selected
}

export const getSelectedRoute = (station: StationRouteAlternatives) =>
  station.alternatives.find((route) => route.id === station.selectedId) ?? station.alternatives[0]

export const matchStationRoute = (stations: StationRouteAlternatives[], stationId: string, destination: LngLat) => {
  const station = stations.find(
    (item) =>
      item.stationId === stationId && item.destination[0] === destination[0] && item.destination[1] === destination[1],
  )
  return station ? getSelectedRoute(station) : undefined
}
