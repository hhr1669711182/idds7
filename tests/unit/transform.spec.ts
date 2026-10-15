import { describe, expect, it } from 'vitest'
import {
  bd09ToGcj02,
  gcj02ToBd09,
  gcj02ToWgs84,
  wgs84ToGcj02,
} from '@/utils/coordTransform'

const expectClose = (actual: number, expected: number, tolerance = 1e-9) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

describe('utils/coordTransform 坐标转换', () => {
  // 正常路径
  it('境内 WGS84 转 GCJ02 偏移符合国测局算法', () => {
    const [lon, lat] = wgs84ToGcj02([116.397128, 39.916527])
    expectClose(lon, 116.40337249402477)
    expectClose(lat, 39.91793074924595)
  })

  // 边界：境外不偏移
  it('境外坐标转换不偏移', () => {
    expect(wgs84ToGcj02([-73.9857, 40.7484])).toEqual([-73.9857, 40.7484])
    expect(gcj02ToWgs84([-73.9857, 40.7484])).toEqual([-73.9857, 40.7484])
  })

  // 契约：BD09 往返漂移在容差内
  it('GCJ02 ↔ BD09 往返转换漂移小于 1e-6', () => {
    const gcj02 = [116.40337249402477, 39.91793074924595] as const
    const bd09 = gcj02ToBd09([gcj02[0], gcj02[1]])
    expectClose(bd09[0], 116.40973933698186)
    expectClose(bd09[1], 39.92426929401509)

    const roundTrip = bd09ToGcj02([bd09[0], bd09[1]])
    expectClose(roundTrip[0], gcj02[0], 1e-6)
    expectClose(roundTrip[1], gcj02[1], 1e-6)
  })

  // 回归：工作日志 2026-10-13 记录的深圳 638m 偏移事故
  it('回归：深圳往返转换误差在 1m 级内（远小于 638m 级事故）', () => {
    const wgs: [number, number] = [113.93, 22.53]
    const [gcjLon, gcjLat] = wgs84ToGcj02(wgs)
    const [backLon, backLat] = gcj02ToWgs84([gcjLon, gcjLat])

    // 往返误差实测约 0.3~0.7m（3~6e-6 度，简化算法固有精度）；638m 事故是 5.7e-3 度级
    expect(Math.abs(wgs[0] - backLon)).toBeLessThan(1e-5)
    expect(Math.abs(wgs[1] - backLat)).toBeLessThan(1e-5)
  })
})
