import type { RouteResult } from '@/apis/amap'
import { parsePolyline, type LngLat } from './amapCoordinate.ts'

const isJam = (status: unknown) => {
  const value = String(status ?? '')
    .trim()
    .toLowerCase()
  return value === '拥堵' || value === 'jam'
}

/** 每个 properties.tmcs 只提取第一次出现的“拥堵”路段起点。 */
export const extractFirstCongestionPoints = (route: RouteResult): LngLat[] =>
  route.routes.flatMap((plan) =>
    plan.features.flatMap((feature) => {
      const firstJam = feature.properties?.tmcs?.find((tmc) => isJam(tmc.status))
      if (!firstJam) return []
      const firstPoint = parsePolyline(firstJam.polyline ?? '')[0]
      return firstPoint ? [firstPoint] : []
    }),
  )
