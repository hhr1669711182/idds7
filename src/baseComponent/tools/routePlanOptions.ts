// 用途：路径规划多方案解析（strategy=11 的方案切分 / 档位判定 / 转向指引解析）。
// 见 herness/02-技术设计/前端/路径规划多方案展示-技术方案.md §4
import type { RoutePlan, RouteResult } from '@/apis/amap'
import { normalizeRouteResults } from '@/baseComponent/amap/routeAlternatives'
import { amapGcj02ToWgs84 } from '@/baseComponent/amap/amapCoordinate'
import { normalizeTmcLevel, type TmcSegmentInput } from '@/baseComponent/amap/routeCongestion'
import type { RoutePlanOption, RouteStepInstruction, RouteTmcLevel } from '@/types/routeAnalysis'
import type { LngLat } from '@/utils/coordTransform'

/** 转向类型：与截图的箭头方向一一对应。 */
export type RouteTurnType = 'straight' | 'left' | 'right' | 'slight_left' | 'slight_right' | 'uturn' | 'arrive'

/** 档位判定所需的一项指标（来自 buildRouteAnalysis 的汇总结果）。 */
export interface RouteOptionMetrics {
  distanceMeters: number
  durationSeconds: number
  /** 拥堵段长度占比（0~1）；无 TMC 时为 0 */
  jamRatio: number
}

/**
 * 档位 → 展示标签。
 * balanced 文案用「综合最优」，与调派路线预览的历史文案「综合推荐」保持一致的产品口径。
 */
export const ROUTE_OPTION_LABELS = {
  fastest: '时间最短',
  shortest: '距离最短',
  avoidJam: '躲避拥堵',
  balanced: '综合最优',
} as const

/** 档位键。 */
export type RouteOptionTier = keyof typeof ROUTE_OPTION_LABELS

/** 档位展示优先级：同一方案命中多档时按此顺序取首个作为主标签。 */
const TIER_PRIORITY: RouteOptionTier[] = ['avoidJam', 'fastest', 'shortest', 'balanced']

/**
 * 从高德 partDesc 解析转向类型。
 * 高德文案形如「沿沙河东路向南行驶456米左转调头」「向北行驶1.3千米向右前方行驶」「到达目的地」。
 * 转向词一般在末尾，需先排除「右转专用道」这类含转向词但实为直行的表述。
 */
export const parseTurnType = (partDesc: string): RouteTurnType => {
  const text = String(partDesc ?? '').trim()
  if (!text) return 'straight'
  if (text.includes('到达目的地') || text.includes('到达终点')) return 'arrive'
  // 「进入右转专用道 / 进入辅路 / 直行进入中间岔道」里的车道名不是转向动作，
  // 需把「进入…」整段剔除后再判定。转向词本身在「进入」之前（实测样本：
  // 「右转进入右转专用道」= 右转，「直行进入中间岔道」= 直行），因此只去后缀即可。
  const normalized = text.replace(/进入[^，,。]*/g, '')
  if (normalized.includes('调头') || normalized.includes('掉头')) return 'uturn'
  if (normalized.includes('向右前方') || normalized.includes('靠右')) return 'slight_right'
  if (normalized.includes('向左前方') || normalized.includes('靠左')) return 'slight_left'
  if (normalized.includes('右转')) return 'right'
  if (normalized.includes('左转')) return 'left'
  return 'straight'
}

/**
 * 把一个 RoutePlan 的 features 解析为转向指引列表。
 * partDesc 缺失的 step 直接跳过；缺 roadName 时只显示文案。
 */
export const parseRouteSteps = (plan: RoutePlan): RouteStepInstruction[] =>
  (plan.features ?? [])
    .map((feature) => {
      const partDesc = String(feature?.properties?.partDesc ?? '').trim()
      if (!partDesc) return null
      const distanceMeters = Number(feature?.properties?.distance)
      // 该 step 的路段几何（WGS84），点击指引时用于定位。
      const coords: [number, number][] = []
      const raw = feature?.geometry?.coordinates
      if (Array.isArray(raw)) {
        raw.forEach((pair) => {
          if (!Array.isArray(pair) || pair.length < 2) return
          const lng = Number(pair[0])
          const lat = Number(pair[1])
          if (Number.isFinite(lng) && Number.isFinite(lat)) coords.push([lng, lat])
        })
      }
      return {
        partDesc,
        roadName: String(feature?.properties?.roadName ?? '').trim(),
        distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : 0,
        turn: parseTurnType(partDesc),
        coords,
      }
    })
    .filter((step): step is RouteStepInstruction => step !== null)

/**
 * 解析一个方案的路线坐标与路况分段。
 * geometry 是 WGS84 可直接上图；tmcs.polyline 是 GCJ-02，需反向纠偏。
 */
export const parseRoutePlanGeometry = (plan: RoutePlan): { coords: LngLat[]; tmcs: TmcSegmentInput[] } => {
  const coords: LngLat[] = []
  const tmcs: TmcSegmentInput[] = []
  const seenPolyline = new Set<string>()

  ;(plan.features ?? []).forEach((feature) => {
    const raw = feature?.geometry?.coordinates
    if (Array.isArray(raw)) {
      raw.forEach((pair) => {
        if (!Array.isArray(pair) || pair.length < 2) return
        const lng = Number(pair[0])
        const lat = Number(pair[1])
        if (Number.isFinite(lng) && Number.isFinite(lat)) coords.push([lng, lat])
      })
    }

    const list = feature?.properties?.tmcs ?? []
    list.forEach((item) => {
      if (!item?.polyline) return
      const segCoords: LngLat[] = []
      const rawPolyline = Array.isArray(item.polyline) ? item.polyline.join(';') : String(item.polyline)
      rawPolyline.split(';').forEach((pair) => {
        const [lngStr, latStr] = pair.split(',')
        const lng = Number(lngStr)
        const lat = Number(latStr)
        if (Number.isFinite(lng) && Number.isFinite(lat)) segCoords.push(amapGcj02ToWgs84([lng, lat]))
      })
      if (segCoords.length >= 2 && !seenPolyline.has(rawPolyline)) {
        seenPolyline.add(rawPolyline)
        tmcs.push({ status: item.status ?? '', polyline: segCoords })
      }
    })
  })

  return { coords, tmcs }
}

/**
 * 判定每个方案命中的档位。
 * 时间最短 = 时长最小者；距离最短 = 距离最小者；躲避拥堵 = 拥堵占比最小者。
 * 同一方案可命中多档（实测常见），返回全部命中档位。
 */
export const resolveOptionTiers = (metrics: RouteOptionMetrics[]): RouteOptionTier[][] => {
  if (!metrics.length) return []
  const minDuration = Math.min(...metrics.map((item) => item.durationSeconds))
  const minDistance = Math.min(...metrics.map((item) => item.distanceMeters))
  const minJam = Math.min(...metrics.map((item) => item.jamRatio))
  const maxJam = Math.max(...metrics.map((item) => item.jamRatio))
  return metrics.map((item) => {
    const tiers: RouteOptionTier[] = []
    if (item.durationSeconds === minDuration) tiers.push('fastest')
    if (item.distanceMeters === minDistance) tiers.push('shortest')
    // 全线无拥堵（各方案拥堵占比一致）时「躲避拥堵」无区分度，不打标，
    // 否则每个方案都会命中该档，标签失去意义。
    if (maxJam > minJam && item.jamRatio === minJam) tiers.push('avoidJam')
    return tiers
  })
}

/**
 * 计算综合最优（双归一化打分最优者）。
 * 单独于 resolveOptionTiers，因为它不是「某一维取最小」，而是时长与距离的加权折中。
 */
export const resolveBalancedIndex = (metrics: RouteOptionMetrics[]): number => {
  if (!metrics.length) return -1
  const minDuration = Math.min(...metrics.map((item) => item.durationSeconds))
  const minDistance = Math.min(...metrics.map((item) => item.distanceMeters))
  if (minDuration <= 0 || minDistance <= 0) return 0
  const score = (item: RouteOptionMetrics) =>
    (item.durationSeconds / minDuration - 1) ** 2 + (item.distanceMeters / minDistance - 1) ** 2
  let bestIndex = 0
  metrics.forEach((item, index) => {
    if (score(item) < score(metrics[bestIndex])) bestIndex = index
  })
  return bestIndex
}

/**
 * 从代理响应中切分出多个方案。
 * 兼容 RoutePlan[] / RouteResult / RouteResult[] 三种形状（与 normalizeRouteResults 同源）。
 */
export const splitRoutePlans = (response: unknown): RoutePlan[] => {
  const results: RouteResult[] = normalizeRouteResults(response)
  const plans: RoutePlan[] = []
  results.forEach((result) => {
    ;(result.routes ?? []).forEach((plan) => {
      if (plan?.features?.length) plans.push(plan)
    })
  })
  return plans
}

/**
 * 构建多方案视图模型。
 * @param response 代理返回的原始响应
 * @param summarize 单个方案的路况指标计算器（由调用方注入，避免此处重复实现口径）
 */
export const buildRoutePlanOptions = (
  response: unknown,
  summarize: (
    tmcs: TmcSegmentInput[],
    totalDistanceMeters: number,
    durationSeconds: number,
  ) => {
    smoothRatio: number
    slowRatio: number
    jamRatio: number
    coverage: number
  },
): RoutePlanOption[] => {
  const plans = splitRoutePlans(response)
  if (!plans.length) return []

  const parsed = plans.map((plan) => {
    const { coords, tmcs } = parseRoutePlanGeometry(plan)
    const distanceMeters = Number(plan.totalDistance) || 0
    const durationSeconds = Number(plan.totalTime) || 0
    const trafficLights = Number(plan.trafficLights) || 0
    const tmc = summarize(tmcs, distanceMeters, durationSeconds)
    return {
      coords,
      tmcs,
      distanceMeters,
      durationSeconds,
      trafficLights,
      steps: parseRouteSteps(plan),
      smoothRatio: tmc.smoothRatio,
      slowRatio: tmc.slowRatio,
      jamRatio: tmc.jamRatio,
      coverage: tmc.coverage,
    }
  })

  const metrics: RouteOptionMetrics[] = parsed.map((item) => ({
    distanceMeters: item.distanceMeters,
    durationSeconds: item.durationSeconds,
    jamRatio: item.jamRatio,
  }))
  const tiersByOption = resolveOptionTiers(metrics)
  const balancedIndex = resolveBalancedIndex(metrics)

  return parsed.map((item, index) => {
    const tiers = [...tiersByOption[index]]
    if (index === balancedIndex && !tiers.includes('balanced')) tiers.push('balanced')
    const primaryTier = TIER_PRIORITY.find((tier) => tiers.includes(tier)) ?? 'balanced'
    return {
      id: `option-${index + 1}`,
      index,
      coords: item.coords,
      tmcs: item.tmcs,
      distanceMeters: item.distanceMeters,
      durationSeconds: item.durationSeconds,
      trafficLights: item.trafficLights,
      steps: item.steps,
      smoothRatio: item.smoothRatio,
      slowRatio: item.slowRatio,
      jamRatio: item.jamRatio,
      coverage: item.coverage,
      tiers,
      primaryTier,
      primaryLabel: ROUTE_OPTION_LABELS[primaryTier],
    }
  })
}

/** 路况等级 → 展示文案（面板与指引区共用）。 */
export const routeTmcLevelLabel = (level: RouteTmcLevel): string => {
  switch (level) {
    case 'smooth':
      return '畅通'
    case 'slow':
      return '缓行'
    case 'jam':
      return '拥堵'
    case 'serious_jam':
      return '严重拥堵'
    default:
      return '未知'
  }
}

/** 归一化路况等级（对外暴露供面板按等级着色）。 */
export { normalizeTmcLevel }
