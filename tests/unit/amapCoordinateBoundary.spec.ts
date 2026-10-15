import { describe, expect, it } from 'vitest'
import {
  amapGcj02ToWgs84,
  parseAmapLocation,
  parsePolyline,
  toAmapGcj02,
  toAmapLngLatString,
} from '@/baseComponent/amap/amapCoordinate'
import { gcj02ToWgs84, wgs84ToGcj02 } from '@/utils/coordTransform'

const expectClose = (actual: number, expected: number, tolerance = 1e-9) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

describe('amap/amapCoordinate 边界转换', () => {
  it('入站边界：GCJ02 转 WGS84（元组与字符串两种入口一致）', () => {
    const gcj02 = [113.579614, 22.275568] as const
    const expected = gcj02ToWgs84([gcj02[0], gcj02[1]])

    const fromTuple = amapGcj02ToWgs84(gcj02)
    const fromString = parseAmapLocation(`${gcj02[0]},${gcj02[1]}`)!

    expectClose(fromTuple[0], expected[0])
    expectClose(fromTuple[1], expected[1])
    expectClose(fromString[0], expected[0])
    expectClose(fromString[1], expected[1])
  })

  it('出站边界：WGS84 转 GCJ02（数组与字符串两种出口一致）', () => {
    const gcj02 = [113.579614, 22.275568] as const
    const wgs84 = gcj02ToWgs84([gcj02[0], gcj02[1]])
    const outbound = toAmapGcj02(wgs84)
    const [stringLng, stringLat] = toAmapLngLatString(wgs84).split(',').map(Number)

    expectClose(outbound[0], wgs84ToGcj02(wgs84)[0])
    expectClose(outbound[1], wgs84ToGcj02(wgs84)[1])
    expectClose(stringLng, outbound[0])
    expectClose(stringLat, outbound[1])
  })

  it('解析高德路线折线为 WGS84 坐标序列', () => {
    const gcj02A = [113.579614, 22.275568] as const
    const gcj02B = [113.575899, 22.274667] as const
    const route = parsePolyline(`${gcj02A.join(',')};${gcj02B.join(',')}`)
    const expectedA = gcj02ToWgs84(gcj02A)
    const expectedB = gcj02ToWgs84(gcj02B)

    expect(route).toHaveLength(2)
    expectClose(route[0][0], expectedA[0])
    expectClose(route[0][1], expectedA[1])
    expectClose(route[1][0], expectedB[0])
    expectClose(route[1][1], expectedB[1])
  })
})