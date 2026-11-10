// 用途：路径指标计算 Worker（避免长路线 Haversine/插值/ETA 折算阻塞主线程）。
// 见 herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §5.4
import { computeRouteMetrics } from '@/baseComponent/amap/routeMetrics'
import type { LngLat } from '@/baseComponent/amap/routeMetrics'

type RouteMetricsRequest = {
  id: number
  path: LngLat[]
  lastMileMeters?: number
}

self.onmessage = (event: MessageEvent<RouteMetricsRequest>) => {
  const { id, path, lastMileMeters } = event.data
  self.postMessage({
    id,
    metrics: computeRouteMetrics(path, lastMileMeters),
  })
}
