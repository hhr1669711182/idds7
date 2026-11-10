// 用途：车辆历史轨迹统计（速度分布 / 停留点 / 异常检测 / 分段指标）。
// 见 herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §5.4
import { distanceMeters } from '@/baseComponent/amap/routeMetrics'
import type { CarTrackPoint } from '@/apis/carTrack'

/** 停留判定阈值：速度低于此值（米/秒）视为静止。 */
export const STOP_SPEED_THRESHOLD_MPS = 0.5
/** 停留判定阈值：连续静止时长达到此值（秒）算作一个停留点。 */
export const STOP_DURATION_THRESHOLD_SECONDS = 120
/** 异常跳点阈值：相邻点位移超过此值（米）视为跳点。 */
export const JUMP_THRESHOLD_METERS = 500
/** 超速阈值（米/秒），约 180 km/h。 */
export const OVERSPEED_THRESHOLD_MPS = 50

/** 速度区间（米/秒）：上界开区间。 */
export interface SpeedBucket {
  /** 区间下界 */
  from: number
  /** 区间上界 */
  to: number
  /** 落在该区间的采样点数 */
  count: number
}

/** 停留点。 */
export interface TrackStopPoint {
  /** 停留起始时间（gpsTime 原值） */
  startedAt: string
  /** 停留结束时间（gpsTime 原值） */
  endedAt: string
  /** 停留时长（秒） */
  durationSeconds: number
  /** 停留位置（WGS84） */
  lngLat: [number, number]
}

/** 轨迹异常。 */
export interface TrackAnomaly {
  type: 'jump' | 'overspeed'
  /** 异常发生在该采样点 */
  at: string
  /** 异常说明 */
  message: string
}

/** 轨迹分段指标。 */
export interface TrackSegmentMetrics {
  /** 分段起止索引（含起不含止） */
  fromIndex: number
  toIndex: number
  /** 分段时长（秒） */
  durationSeconds: number
  /** 分段距离（米） */
  distanceMeters: number
  /** 分段平均速度（米/秒） */
  averageSpeedMps: number
}

/** 轨迹统计汇总。 */
export interface TrackStatistics {
  /** 采样点数 */
  pointCount: number
  /** 总时长（秒） */
  totalDurationSeconds: number
  /** 总距离（米） */
  totalDistanceMeters: number
  /** 平均速度（米/秒） */
  averageSpeedMps: number
  /** 最高速度（米/秒） */
  maxSpeedMps: number
  /** 速度分布 */
  speedBuckets: SpeedBucket[]
  /** 停留点 */
  stops: TrackStopPoint[]
  /** 异常 */
  anomalies: TrackAnomaly[]
  /** 分段指标 */
  segments: TrackSegmentMetrics[]
  /** 样本是否有限（点数过少，结论不可外推） */
  limitedSample: boolean
}

/** 解析 gpsTime（yyyy-MM-dd HH:mm:ss）为毫秒时间戳；非法值返回 NaN。 */
const parseGpsTime = (value: string): number => {
  const timestamp = Date.parse(String(value ?? '').replace(' ', 'T'))
  return Number.isFinite(timestamp) ? timestamp : NaN
}

/** 速度分布的固定分档（米/秒）。 */
const SPEED_BUCKETS: Array<{ from: number; to: number }> = [
  { from: 0, to: STOP_SPEED_THRESHOLD_MPS },
  { from: STOP_SPEED_THRESHOLD_MPS, to: 8.33 },
  { from: 8.33, to: 16.67 },
  { from: 16.67, to: 25 },
  { from: 25, to: OVERSPEED_THRESHOLD_MPS },
  { from: OVERSPEED_THRESHOLD_MPS, to: Number.POSITIVE_INFINITY },
]

/** 样本点数下限：低于此值统计结论不可外推。 */
const LIMITED_SAMPLE_THRESHOLD = 20

/**
 * 计算轨迹统计。
 * 纯函数、无 OL 依赖，可直接单测。
 * 时间轴依赖 gpsTime，非法时间点按「跳过该点」处理，不计入时长与速度。
 */
export const analyzeTrackStatistics = (points: CarTrackPoint[]): TrackStatistics => {
  const valid = (points ?? []).filter(
    (point) =>
      Number.isFinite(point?.longitude) &&
      Number.isFinite(point?.latitude) &&
      Number.isFinite(parseGpsTime(point?.gpsTime ?? '')),
  )

  const speedBuckets: SpeedBucket[] = SPEED_BUCKETS.map((bucket) => ({ ...bucket, count: 0 }))
  const stops: TrackStopPoint[] = []
  const anomalies: TrackAnomaly[] = []
  const segments: TrackSegmentMetrics[] = []

  let totalDistance = 0
  let totalDuration = 0
  let maxSpeed = 0
  let speedSum = 0
  let speedCount = 0

  let stopStartIndex = -1
  let segmentStartIndex = 0
  let segmentDistance = 0
  let segmentDuration = 0

  for (let index = 1; index < valid.length; index += 1) {
    const previous = valid[index - 1]
    const current = valid[index]
    const previousTime = parseGpsTime(previous.gpsTime)
    const currentTime = parseGpsTime(current.gpsTime)
    const deltaSeconds = Math.max(0, (currentTime - previousTime) / 1000)
    const stepDistance = distanceMeters([previous.longitude, previous.latitude], [current.longitude, current.latitude])
    const speed = deltaSeconds > 0 ? stepDistance / deltaSeconds : 0

    totalDistance += stepDistance
    totalDuration += deltaSeconds
    segmentDistance += stepDistance
    segmentDuration += deltaSeconds

    if (stepDistance > JUMP_THRESHOLD_METERS) {
      anomalies.push({
        type: 'jump',
        at: current.gpsTime,
        message: `相邻点位移 ${Math.round(stepDistance)} 米，疑似轨迹跳点`,
      })
    }
    if (speed > OVERSPEED_THRESHOLD_MPS) {
      anomalies.push({
        type: 'overspeed',
        at: current.gpsTime,
        message: `瞬时速度 ${(speed * 3.6).toFixed(0)} km/h，超过常规上限`,
      })
    }

    if (stepDistance > 0) {
      speedSum += speed
      speedCount += 1
      if (speed > maxSpeed) maxSpeed = speed
      const bucket = speedBuckets.find(
        (item) => speed >= item.from && (item.to === Number.POSITIVE_INFINITY ? true : speed < item.to),
      )
      if (bucket) bucket.count += 1
    } else {
      speedBuckets[0].count += 1
    }

    // 停留点累计：连续静止（位移近零）且时长达标才记一段
    const isStationary = stepDistance <= STOP_SPEED_THRESHOLD_MPS * deltaSeconds
    if (isStationary) {
      if (stopStartIndex < 0) stopStartIndex = index - 1
    } else if (stopStartIndex >= 0) {
      const stopDuration = (currentTime - parseGpsTime(valid[stopStartIndex].gpsTime)) / 1000
      if (stopDuration >= STOP_DURATION_THRESHOLD_SECONDS) {
        stops.push({
          startedAt: valid[stopStartIndex].gpsTime,
          endedAt: previous.gpsTime,
          durationSeconds: stopDuration,
          lngLat: [valid[stopStartIndex].longitude, valid[stopStartIndex].latitude],
        })
      }
      stopStartIndex = -1
    }

    // 分段：每 10 个采样点切一段，避免指标粒度过细
    if (index - segmentStartIndex >= 10) {
      segments.push({
        fromIndex: segmentStartIndex,
        toIndex: index,
        durationSeconds: segmentDuration,
        distanceMeters: segmentDistance,
        averageSpeedMps: segmentDuration > 0 ? segmentDistance / segmentDuration : 0,
      })
      segmentStartIndex = index
      segmentDistance = 0
      segmentDuration = 0
    }
  }

  // 收尾：补最后一段与末尾停留点
  if (segmentStartIndex < valid.length - 1) {
    segments.push({
      fromIndex: segmentStartIndex,
      toIndex: valid.length - 1,
      durationSeconds: segmentDuration,
      distanceMeters: segmentDistance,
      averageSpeedMps: segmentDuration > 0 ? segmentDistance / segmentDuration : 0,
    })
  }
  if (stopStartIndex >= 0 && valid.length > 0) {
    const last = valid[valid.length - 1]
    const stopDuration = (parseGpsTime(last.gpsTime) - parseGpsTime(valid[stopStartIndex].gpsTime)) / 1000
    if (stopDuration >= STOP_DURATION_THRESHOLD_SECONDS) {
      stops.push({
        startedAt: valid[stopStartIndex].gpsTime,
        endedAt: last.gpsTime,
        durationSeconds: stopDuration,
        lngLat: [valid[stopStartIndex].longitude, valid[stopStartIndex].latitude],
      })
    }
  }

  return {
    pointCount: valid.length,
    totalDurationSeconds: totalDuration,
    totalDistanceMeters: totalDistance,
    averageSpeedMps: speedCount > 0 ? speedSum / speedCount : 0,
    maxSpeedMps: maxSpeed,
    speedBuckets,
    stops,
    anomalies,
    segments,
    limitedSample: valid.length < LIMITED_SAMPLE_THRESHOLD,
  }
}
