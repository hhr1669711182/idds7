// 用途：路径分析统一入口（构建分析结果 / 候选对比 / 路段衔接）。
// 见 herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §5.4
import { distanceMeters } from '@/baseComponent/amap/routeMetrics'
import { normalizeTmcLevel, summarizeTmc, type TmcSegmentInput } from '@/baseComponent/amap/routeCongestion'
import type {
  RouteAnalysisDTO,
  RouteCandidateComparison,
  RouteTmcSegmentAnalysis,
} from '@/types/routeAnalysis'
import type { LngLat } from '@/utils/coordTransform'

/** 构建分析结果的入参。 */
export interface RouteAnalysisInput {
  /** 路线坐标序列（WGS84） */
  path: LngLat[]
  /** 路况分段 */
  tmcs?: TmcSegmentInput[]
  /** 路线总距离（米）；缺省时按坐标序列实算 */
  distanceMeters?: number
  /** 路线总时长（秒） */
  durationSeconds?: number
  /** 候选方案序（0 为首选）；非候选路线传 null */
  candidateRank?: number | null
}

/**
 * 构建路径分析结果。
 * 纯函数、无 OL 副作用，可直接单测。
 * 距离缺省时按球面距离累加坐标序列，与高德返回的 totalDistance 口径一致时两者相等。
 */
export const buildRouteAnalysis = (input: RouteAnalysisInput): RouteAnalysisDTO => {
  const path = input.path ?? []
  let measuredDistance = 0
  for (let index = 1; index < path.length; index += 1) {
    measuredDistance += distanceMeters(path[index - 1], path[index])
  }
  const distanceMetersValue = input.distanceMeters ?? measuredDistance
  const durationSeconds = input.durationSeconds ?? 0
  const tmc = summarizeTmc(input.tmcs ?? [], {
    totalDistanceMeters: distanceMetersValue,
    durationSeconds,
  })

  return {
    distanceMeters: distanceMetersValue,
    durationSeconds,
    tmc,
    candidateRank: input.candidateRank ?? null,
    segments: tmcSegmentsOf(input.tmcs ?? []),
    path: path.map((point) => [point[0], point[1]] as [number, number]),
  }
}

/** 路况分段明细（按段长度与等级标注）。 */
const tmcSegmentsOf = (segments: TmcSegmentInput[]): RouteTmcSegmentAnalysis[] =>
  segments
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

/** 候选对比的入参。 */
export interface RouteCandidateInput {
  /** 方案标识 */
  id: string
  /** 方案名（展示用） */
  label: string
  /** 距离（米） */
  distanceMeters: number
  /** 时长（秒） */
  durationSeconds: number
  /** 拥堵占比（0~1） */
  jamRatio: number
}

/**
 * 候选方案对比：按「拥堵优先、时长次之、距离末位」选出推荐标尺。
 * 推荐方案取拥堵占比最低者；拥堵占比相同则取时长更短者。
 * @returns 带 recommended 标记的对比列表，顺序与入参一致
 */
export const compareCandidates = (candidates: RouteCandidateInput[]): RouteCandidateComparison[] => {
  if (!candidates.length) return []
  const recommended = candidates.reduce((best, current) => {
    if (current.jamRatio !== best.jamRatio) return current.jamRatio < best.jamRatio ? current : best
    if (current.durationSeconds !== best.durationSeconds) {
      return current.durationSeconds < best.durationSeconds ? current : best
    }
    return current.distanceMeters < best.distanceMeters ? current : best
  })
  return candidates.map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    distanceMeters: candidate.distanceMeters,
    durationSeconds: candidate.durationSeconds,
    jamRatio: candidate.jamRatio,
    recommended: candidate.id === recommended.id,
  }))
}

/** 路段衔接的最小间距（米）：小于该值视为同一点，不重复补点。 */
const CONTINUITY_TOLERANCE_METERS = 0.5

/**
 * 保证相邻路况段几何连续。
 * 段末点与下一段首点不重合时，把下一段首点补进当前段末，保证整条线无缺口。
 * @param segments 路况分段（按路线顺序）
 * @returns 补齐后的新分段数组（不修改入参）
 */
export const ensureSegmentContinuity = (
  segments: TmcSegmentInput[],
): (TmcSegmentInput & { polyline: LngLat[] })[] => {
  const result: (TmcSegmentInput & { polyline: LngLat[] })[] = []
  segments.forEach((segment, index) => {
    const polyline = [...(segment.polyline ?? [])]
    if (index > 0 && polyline.length >= 1) {
      const previous = result[result.length - 1]
      const previousEnd = previous?.polyline[previous.polyline.length - 1]
      const currentStart = polyline[0]
      if (previousEnd && currentStart) {
        const gap = distanceMeters(previousEnd, currentStart)
        if (gap > CONTINUITY_TOLERANCE_METERS) {
          previous.polyline.push(currentStart)
        }
      }
    }
    result.push({ ...segment, polyline })
  })
  return result
}