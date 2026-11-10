// 用途：路段衔接 Worker 句柄（不可用时回退主线程同步计算）。
// 见 herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §5.4
import { ensureSegmentContinuity } from '@/baseComponent/tools/routeAnalysis'
import type { TmcSegmentInput } from '@/baseComponent/amap/routeCongestion'
import type { LngLat } from '@/utils/coordTransform'

type PendingTask = {
  resolve: (segments: (TmcSegmentInput & { polyline: LngLat[] })[]) => void
  reject: (error: Error) => void
}

type ContinuityResponse = {
  id: number
  segments: (TmcSegmentInput & { polyline: LngLat[] })[]
}

/**
 * 创建路段衔接 Worker 句柄。
 * Worker 不可用（SSR / 老浏览器）时直接在主线程同步计算，行为一致。
 */
export const createRouteContinuityWorker = () => {
  let worker: Worker | null = null
  let requestId = 0
  const pending = new Map<number, PendingTask>()

  const ensureWorker = () => {
    if (worker || typeof Worker === 'undefined') return worker
    worker = new Worker(new URL('../worker/routeContinuity.worker.ts', import.meta.url), {
      type: 'module',
    })

    worker.onmessage = (event: MessageEvent<ContinuityResponse>) => {
      const task = pending.get(event.data.id)
      if (!task) return
      pending.delete(event.data.id)
      task.resolve(event.data.segments)
    }

    worker.onerror = (event) => {
      const error = new Error(event.message || 'Route continuity worker failed')
      pending.forEach((task) => task.reject(error))
      pending.clear()
    }

    return worker
  }

  const ensureContinuity = (segments: TmcSegmentInput[]): Promise<(TmcSegmentInput & { polyline: LngLat[] })[]> => {
    const currentWorker = ensureWorker()
    if (!currentWorker) {
      return Promise.resolve(ensureSegmentContinuity(segments))
    }

    const id = ++requestId
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      currentWorker.postMessage({ id, segments })
    })
  }

  const destroy = () => {
    pending.forEach((task) => task.reject(new Error('Route continuity worker destroyed')))
    pending.clear()
    worker?.terminate()
    worker = null
  }

  return { ensureContinuity, destroy }
}
