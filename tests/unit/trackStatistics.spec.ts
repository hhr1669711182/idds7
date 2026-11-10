import { describe, expect, it } from 'vitest'
import { analyzeTrackStatistics } from '@/utils/trackStatistics'
import type { CarTrackPoint } from '@/apis/carTrack'

/** 构造轨迹点：经纬度线性递增，时间按起点偏移连续递增。 */
const buildPoints = (
  count: number,
  stepSeconds = 1,
  options: { startSeconds?: number; longitudeStep?: number; longitudeBase?: number } = {},
): CarTrackPoint[] => {
  const startSeconds = options.startSeconds ?? 0
  const longitudeStep = options.longitudeStep ?? 0.0001
  const longitudeBase = options.longitudeBase ?? 116.4
  return Array.from({ length: count }, (_, index) => {
    const seconds = startSeconds + index * stepSeconds
    const hour = String(Math.floor(seconds / 3600)).padStart(2, '0')
    const minute = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
    const second = String(seconds % 60).padStart(2, '0')
    return {
      carId: 'car-1',
      plateNumber: '粤B00001',
      longitude: longitudeBase + index * longitudeStep,
      latitude: 39.9,
      gpsTime: `2026-08-17 ${hour}:${minute}:${second}`,
    }
  })
}

/**
 * 轨迹统计契约：
 * 非法时间点必须被跳过；
 * 停留点只在「连续静止且时长达标」时记一段；
 * 跳点与超速必须被检出；
 * 样本过少时必须标记 limitedSample（结论不可外推）。
 */
describe('utils/trackStatistics 轨迹统计', () => {
  it('空轨迹：返回零值统计，不抛异常', () => {
    // Given 空轨迹
    // When 统计
    const stats = analyzeTrackStatistics([])
    // Then 返回零值结构
    expect(stats.pointCount).toBe(0)
    expect(stats.totalDistanceMeters).toBe(0)
    expect(stats.averageSpeedMps).toBe(0)
    expect(stats.stops.length).toBe(0)
    expect(stats.anomalies.length).toBe(0)
    expect(stats.limitedSample).toBe(true)
  })

  it('正常行驶：总时长与均速可算，样本充足时不标记 limitedSample', () => {
    // Given 30 个每秒一点、匀速前进的轨迹点
    const points = buildPoints(30)
    // When 统计
    const stats = analyzeTrackStatistics(points)
    // Then 时长为 29 秒，均速大于 0
    expect(stats.pointCount).toBe(30)
    expect(stats.totalDurationSeconds).toBeCloseTo(29, 3)
    expect(stats.averageSpeedMps).toBeGreaterThan(0)
    expect(stats.limitedSample).toBe(false)
  })

  it('非法时间点：被跳过，不计入点数与时长', () => {
    // Given 混入一个非法 gpsTime 的轨迹
    const points = buildPoints(5)
    points[2] = { ...points[2], gpsTime: 'not-a-time' }
    // When 统计
    const stats = analyzeTrackStatistics(points)
    // Then 非法点被剔除
    expect(stats.pointCount).toBe(4)
  })

  it('停留点：连续静止超过阈值记一段，低于阈值不记', () => {
    // Given 前 121 点静止（同一坐标、每秒一点，累计 120 秒），之后 20 点移动
    const stopped = buildPoints(121, 1, { longitudeStep: 0 })
    const moving = buildPoints(20, 1, { startSeconds: 121, longitudeStep: 0.01 })
    const points = [...stopped, ...moving]
    // When 统计
    const stats = analyzeTrackStatistics(points)
    // Then 检出停留点，且时长不短于阈值
    expect(stats.stops.length).toBeGreaterThanOrEqual(1)
    expect(stats.stops[0].durationSeconds).toBeGreaterThanOrEqual(120)

    // Given 静止时长不足阈值（仅 60 秒）后开始移动
    const shortStopped = buildPoints(61, 1, { longitudeStep: 0 })
    const shortMoving = buildPoints(20, 1, { startSeconds: 61, longitudeStep: 0.01 })
    // When 统计
    const shortStats = analyzeTrackStatistics([...shortStopped, ...shortMoving])
    // Then 不记停留点
    expect(shortStats.stops.length).toBe(0)
  })

  it('异常检测：相邻点位移超阈值记跳点', () => {
    // Given 中间一个点跳到远处
    const points = buildPoints(5)
    points[2] = { ...points[2], longitude: 116.5 }
    // When 统计
    const stats = analyzeTrackStatistics(points)
    // Then 检出跳点异常
    expect(stats.anomalies.some((item) => item.type === 'jump')).toBe(true)
  })

  it('样本有限：点数低于阈值时标记 limitedSample', () => {
    // Given 只有 5 个点的轨迹
    const points = buildPoints(5)
    // When 统计
    const stats = analyzeTrackStatistics(points)
    // Then 标记样本有限
    expect(stats.limitedSample).toBe(true)
  })

  it('分段指标：点数足够时切出多段，每段距离可加总', () => {
    // Given 25 个轨迹点
    const points = buildPoints(25)
    // When 统计
    const stats = analyzeTrackStatistics(points)
    // Then 切出多段且累计距离与总距离一致
    expect(stats.segments.length).toBeGreaterThan(1)
    const segmentTotal = stats.segments.reduce((total, segment) => total + segment.distanceMeters, 0)
    expect(segmentTotal).toBeCloseTo(stats.totalDistanceMeters, 3)
  })
})
