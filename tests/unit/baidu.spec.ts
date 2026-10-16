import { describe, expect, it } from 'vitest'
import { fromLonLat, transform } from 'ol/proj.js'
import type { TileCoord } from 'ol/tilecoord.js'

import { createBaiduSource, registerBaiduProjection } from '@/baseComponent/tools/baidu'

const tileUrl = (mapType: 'road' | 'image', tileCoord: TileCoord) => {
  const projection = registerBaiduProjection()
  const source = createBaiduSource({ mapType })
  return source.getTileUrlFunction()(tileCoord, 1, projection)
}

const expectClose = (actual: number, expected: number, tolerance = 1e-5) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

describe('tools/baidu 百度底图', () => {
  it('投影只注册一次且 code 为 baidu', () => {
    const first = registerBaiduProjection()
    const second = registerBaiduProjection()

    expect(first).toBe(second)
    expect(first.getCode()).toBe('baidu')
  })

  it('按 mapType 生成 road / image 瓦片地址', () => {
    const roadUrl = tileUrl('road', [10, 12, -4])
    const imageUrl = tileUrl('image', [10, 12, -4])

    // 百度源按 0~3 随机子域负载均衡（见 baidu.ts），断言需容忍子域变化
    expect(roadUrl).toMatch(/online[0-3]\.map\.bdimg\.com\/tile/)
    expect(roadUrl).toMatch(/x=12&y=3&z=10/)
    expect(roadUrl).toMatch(/styles=pl/)
    expect(imageUrl).toMatch(/shangetu[0-3]\.map\.bdimg\.com\/it\/u=x=12;y=3;z=10/)
    expect(imageUrl).toMatch(/type=sate/)
  })

  it('瓦片 y 使用百度坐标而非 OpenLayers 行号（关键算法差异）', () => {
    const source = createBaiduSource({ mapType: 'road' })
    const projection = source.getProjection()!
    const tileGrid = source.getTileGrid()!
    const baiduCoord = transform(fromLonLat([113.5437, 22.2657]), 'EPSG:3857', projection)
    const tileCoord = tileGrid.getTileCoordForCoordAndZ(baiduCoord, 14)
    const url = source.getTileUrlFunction()(tileCoord, 1, projection)

    expect(tileCoord).toEqual([14, 3086, -618])
    expect(url).toMatch(/x=3086&y=617&z=14/)
  })

  it('经纬度与百度墨卡托往返转换可逆', () => {
    registerBaiduProjection()

    const lonLat = [116.397128, 39.916527]
    const mercator = transform(lonLat, 'EPSG:4326', 'baidu')
    const roundTrip = transform(mercator, 'baidu', 'EPSG:4326')

    expectClose(roundTrip[0], lonLat[0])
    expectClose(roundTrip[1], lonLat[1])
  })
})
