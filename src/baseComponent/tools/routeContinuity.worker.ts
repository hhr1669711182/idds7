// 用途：路段衔接计算 Worker（避免多段几何补点在主线程阻塞）。
// 见 herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §5.4
import { ensureSegmentContinuity } from './routeAnalysis'
import type { TmcSegmentInput } from '@/baseComponent/amap/routeCongestion'
import type { LngLat } from '@/utils/coordTransform'

type RouteContinuityRequest = {
  id: number
  segments: TmcSegmentInput[]
}

type RouteContinuityResponse = {
  id: number
  segments: (TmcSegmentInput & { polyline: LngLat[] })[]
}

self.onmessage = (event: MessageEvent<RouteContinuityRequest>) => {
  const { id, segments } = event.data
  const result: RouteContinuityResponse = {
    id,
    segments: ensureSegmentContinuity(segments ?? []),
  }
  self.postMessage(result)
}