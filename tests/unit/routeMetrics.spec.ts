import { describe, expect, it } from 'vitest'
import {
  computeRouteMetrics,
  distanceMeters,
  formatCountdownSeconds,
  type LngLat,
} from '@/baseComponent/amap/routeMetrics'

/**
 * 轨迹里程指标契约：
 * 最后一公里起点必须落在「距终点正好 1000m」的位置，倒计时文本按 mm:ss（不封顶小时）。
 */
describe('amap/routeMetrics 轨迹里程指标', () => {
  it('长路径：最后一公里起点距终点约 1000m，总里程落在合理区间', () => {
    const longRoute: LngLat[] = [
      [0, 0],
      [0, 0.02],
    ]
    const metrics = computeRouteMetrics(longRoute, 1000)

    expect(metrics.distanceIndexMeters.length).toBe(2)
    expect(metrics.distanceIndexMeters[0]).toBe(0)
    expect(metrics.totalDistanceMeters).toBeGreaterThan(2220)
    expect(metrics.totalDistanceMeters).toBeLessThan(2228)
    expect(Math.round(metrics.lastMileStartDistanceMeters)).toBe(Math.round(metrics.totalDistanceMeters - 1000))
    expect(metrics.lastMileStartPoint).toBeTruthy()
    expect(Math.abs(distanceMeters(metrics.lastMileStartPoint!, longRoute[1]) - 1000)).toBeLessThan(2)
  })

  it('短路径（不足 1000m）：最后一公里起点退化为路径起点', () => {
    const shortRoute: LngLat[] = [
      [113.5, 22.2],
      [113.5005, 22.2005],
    ]
    const metrics = computeRouteMetrics(shortRoute, 1000)

    expect(metrics.lastMileStartDistanceMeters).toBe(0)
    expect(metrics.lastMileStartPoint).toEqual(shortRoute[0])
  })

  it('倒计时格式化：秒级不进位、跨分钟补零、超过 1 小时不封顶', () => {
    expect(formatCountdownSeconds(0)).toBe('00:00')
    expect(formatCountdownSeconds(61)).toBe('01:01')
    expect(formatCountdownSeconds(3661)).toBe('61:01')
  })
})
