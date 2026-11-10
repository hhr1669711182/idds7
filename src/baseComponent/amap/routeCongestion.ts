// 用途：路况（TMC）归一与指标汇总。
// 见 herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §5.4
import type { RouteResult } from '@/apis/amap'
import { parsePolyline, type LngLat } from './amapCoordinate.ts'
import { distanceMeters } from './routeMetrics'
import type { RouteTmcLevel, RouteTmcMetrics, RouteTmcSegmentAnalysis } from '@/types/routeAnalysis'

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

/**
 * 把高德路况等级归一为分析用的等级。
 * 兼容三种形态：数字编码（0 未知 / 1 畅通 / 2 缓行 / 3 拥堵 / 4 严重拥堵）、
 * 中文文案（畅通 / 缓行 / 拥堵 / 严重拥堵）与英文（smooth / slow / jam / serious_jam）。
 * 无法识别的一律归 unknown，不并入畅通。
 */
export const normalizeTmcLevel = (status: unknown): RouteTmcLevel => {
  const raw = String(status ?? '')
    .trim()
    .toLowerCase()
  if (raw === '1' || raw === '畅通' || raw === 'smooth') return 'smooth'
  if (raw === '2' || raw === '缓行' || raw === 'slow') return 'slow'
  if (raw === '3' || raw === '拥堵' || raw === 'jam') return 'jam'
  if (raw === '4' || raw === '5' || raw === '严重拥堵' || raw === '极度拥堵' || raw === 'serious_jam') {
    return 'serious_jam'
  }
  return 'unknown'
}

/** 一段路况的坐标与长度。 */
export interface TmcSegmentInput {
  /** 路况等级：数字编码（1~4）、中文文案或英文标识 */
  status: string | number
  polyline: LngLat[]
}

/**
 * 汇总路况指标。
 * 各段长度按球面距离累加；占比以「有路况数据的总长度」为分母，
 * 覆盖率另算（有路况长度 / 全路长度），避免缺失路段被当作畅通。
 */
export const summarizeTmc = (
  segments: TmcSegmentInput[],
  options?: { totalDistanceMeters?: number; durationSeconds?: number },
): RouteTmcMetrics => {
  const analyzed: RouteTmcSegmentAnalysis[] = segments
    .map((segment) => {
      const polyline = segment.polyline ?? []
      let distance = 0
      for (let index = 1; index < polyline.length; index += 1) {
        distance += distanceMeters(polyline[index - 1], polyline[index])
      }
      return {
        level: normalizeTmcLevel(segment.status),
        polyline: polyline.map((point) => [point[0], point[1]] as [number, number]),
        distanceMeters: distance,
      }
    })
    .filter((segment) => segment.polyline.length >= 2)

  const sumBy = (levels: RouteTmcLevel[]) =>
    analyzed
      .filter((segment) => levels.includes(segment.level))
      .reduce((total, segment) => total + segment.distanceMeters, 0)

  const smoothDistance = sumBy(['smooth'])
  const slowDistance = sumBy(['slow'])
  const jamDistance = sumBy(['jam', 'serious_jam'])
  const unknownDistance = sumBy(['unknown'])
  const coveredDistance = smoothDistance + slowDistance + jamDistance + unknownDistance

  const totalDistanceMeters = options?.totalDistanceMeters ?? coveredDistance
  const ratio = (value: number) => (coveredDistance > 0 ? value / coveredDistance : 0)

  // 拥堵段时长按全路均速折算：无总时长则不给估算值。
  const durationSeconds = options?.durationSeconds ?? 0
  const averageSpeed = durationSeconds > 0 && totalDistanceMeters > 0 ? totalDistanceMeters / durationSeconds : 0

  return {
    smoothRatio: ratio(smoothDistance),
    slowRatio: ratio(slowDistance),
    jamRatio: ratio(jamDistance),
    unknownRatio: ratio(unknownDistance),
    coverage:
      totalDistanceMeters > 0 ? Math.min(1, coveredDistance / totalDistanceMeters) : coveredDistance > 0 ? 1 : 0,
    jamDistanceMeters: jamDistance,
    jamDurationSeconds: averageSpeed > 0 ? jamDistance / averageSpeed : 0,
    totalDistanceMeters,
  }
}
