import { describe, expect, it } from 'vitest'
import { buildRoutePlanOptions } from '@/baseComponent/tools/routePlanOptions'
import { summarizeTmc } from '@/baseComponent/amap/routeCongestion'

/**
 * 真实代理响应回归（不连网关，用固化样本）。
 * 样本取自 http://192.168.169.28:33082/api/amap/route/driving?strategy=11 实测返回：
 *   方案0 6350m/1079s/10灯   方案1 6154m/999s/12灯   方案2 6062m/1048s/9灯
 * 用于锁定「多方案切分 + 档位判定 + 转向指引」的真实口径。
 */
const REAL_RESPONSE = {
  data: [
    {
      type: 'FeatureCollection',
      totalFeatures: '11',
      totalTime: '1079',
      totalDistance: '6350',
      trafficLights: '10',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
      features: [
        {
          type: 'Feature',
          id: '1',
          geometry: {
            type: 'LineString',
            coordinates: [
              [113.954794124631, 22.5431218402622],
              [113.959269541589, 22.5431648437427],
            ],
          },
          properties: {
            distance: '461',
            partDesc: '沿深南大道辅路途径深南大道向东行驶461米右转进入右转专用道',
            roadName: '深南大道辅路',
            tmcs: [],
          },
        },
        {
          type: 'Feature',
          id: '2',
          geometry: {
            type: 'LineString',
            coordinates: [
              [113.959269541589, 22.5431648437427],
              [113.959532046849, 22.5427292089225],
            ],
          },
          properties: {
            distance: '55',
            partDesc: '沿沙河东路向东南行驶55米右转',
            roadName: '沙河东路',
            tmcs: [],
          },
        },
        {
          type: 'Feature',
          id: '3',
          geometry: {
            type: 'LineString',
            coordinates: [
              [113.959532046849, 22.5427292089225],
              [113.95895345569313, 22.538643917561622],
            ],
          },
          properties: {
            distance: '456',
            partDesc: '沿沙河东路向南行驶456米左转调头',
            roadName: '沙河东路',
            tmcs: [],
          },
        },
      ],
    },
    {
      type: 'FeatureCollection',
      totalFeatures: '8',
      totalTime: '999',
      totalDistance: '6154',
      trafficLights: '12',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
      features: [
        {
          type: 'Feature',
          id: '1',
          geometry: {
            type: 'LineString',
            coordinates: [
              [113.9547, 22.5431],
              [113.9552, 22.5431],
            ],
          },
          properties: {
            distance: '3700',
            partDesc: '沿深南大道辅路途径深南大道向东行驶3.7千米向右前方行驶进入辅路',
            roadName: '深南大道辅路',
            tmcs: [],
          },
        },
      ],
    },
    {
      type: 'FeatureCollection',
      totalFeatures: '13',
      totalTime: '1048',
      totalDistance: '6062',
      trafficLights: '9',
      crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
      features: [
        {
          type: 'Feature',
          id: '1',
          geometry: {
            type: 'LineString',
            coordinates: [
              [113.9547, 22.5431],
              [113.9552, 22.5431],
            ],
          },
          properties: {
            distance: '258',
            partDesc: '沿香山西街向东北行驶258米向右前方行驶进入右转专用道',
            roadName: '香山西街',
            tmcs: [],
          },
        },
      ],
    },
  ],
}

describe('真实代理响应回归（strategy=11）', () => {
  it('切分出 3 个方案，距离 / 耗时 / 红绿灯与实测一致', () => {
    // Given 固化的真实响应
    // When 构建
    const options = buildRoutePlanOptions(REAL_RESPONSE, (tmcs, totalDistanceMeters, durationSeconds) =>
      summarizeTmc(tmcs, { totalDistanceMeters, durationSeconds }),
    )
    // Then 三个方案，指标原样透传
    expect(options).toHaveLength(3)
    expect(options.map((item) => item.distanceMeters)).toEqual([6350, 6154, 6062])
    expect(options.map((item) => item.durationSeconds)).toEqual([1079, 999, 1048])
    expect(options.map((item) => item.trafficLights)).toEqual([10, 12, 9])
  })

  it('档位判定：方案1=时间最短且综合最优、方案2=距离最短、方案0无档位', () => {
    // Given 真实指标
    const options = buildRoutePlanOptions(REAL_RESPONSE, (tmcs, totalDistanceMeters, durationSeconds) =>
      summarizeTmc(tmcs, { totalDistanceMeters, durationSeconds }),
    )
    // When / Then 各方案的档位
    expect(options[1].tiers).toContain('fastest')
    expect(options[2].tiers).toContain('shortest')
    // 方案1 同时最快、距离次短 → 双归一化打分最优，落综合最优
    expect(options[1].tiers).toContain('balanced')
    expect(options[1].primaryLabel).toBe('时间最短')
    // 方案0 距离最长、耗时最长，任何维度都不占优 → 无档位
    expect(options[0].tiers).toEqual([])
  })

  it('转向指引：真实 partDesc 解析出正确转向类型', () => {
    // Given 真实响应
    const options = buildRoutePlanOptions(REAL_RESPONSE, (tmcs, totalDistanceMeters, durationSeconds) =>
      summarizeTmc(tmcs, { totalDistanceMeters, durationSeconds }),
    )
    // When 解析第一方案的指引
    const turns = options[0].steps.map((step) => step.turn)
    // Then 右转 / 右转 / 掉头
    expect(turns).toEqual(['right', 'right', 'uturn'])
    // And 原文保留
    expect(options[0].steps[2].partDesc).toBe('沿沙河东路向南行驶456米左转调头')
    // And 第二方案的「向右前方行驶进入辅路」判为稍偏右
    expect(options[1].steps[0].turn).toBe('slight_right')
    // And 第三方案的「向右前方行驶进入右转专用道」判为稍偏右（车道名不改判定）
    expect(options[2].steps[0].turn).toBe('slight_right')
  })

  it('转向指引带路段几何：可用于点击定位到该路段', () => {
    // Given 真实响应
    const options = buildRoutePlanOptions(REAL_RESPONSE, (tmcs, totalDistanceMeters, durationSeconds) =>
      summarizeTmc(tmcs, { totalDistanceMeters, durationSeconds }),
    )
    // When / Then 每条指引都带 WGS84 路段坐标
    options.forEach((option) => {
      option.steps.forEach((step) => {
        expect(step.coords.length).toBeGreaterThanOrEqual(2)
        step.coords.forEach((point) => {
          expect(Number.isFinite(point[0])).toBe(true)
          expect(Number.isFinite(point[1])).toBe(true)
        })
      })
    })
    // And 同一方案内相邻路段首尾相接，可连续定位
    const first = options[0].steps
    for (let i = 1; i < first.length; i += 1) {
      const prevEnd = first[i - 1].coords[first[i - 1].coords.length - 1]
      const currStart = first[i].coords[0]
      expect(prevEnd[0]).toBeCloseTo(currStart[0], 6)
      expect(prevEnd[1]).toBeCloseTo(currStart[1], 6)
    }
  })
})
