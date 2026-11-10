import { describe, expect, it } from 'vitest'
import {
  buildRoutePlanOptions,
  parseRouteSteps,
  parseTurnType,
  resolveBalancedIndex,
  resolveOptionTiers,
  splitRoutePlans,
} from '@/baseComponent/tools/routePlanOptions'
import { summarizeTmc } from '@/baseComponent/amap/routeCongestion'

/**
 * 多方案契约（实测代理 http://192.168.169.28:33082/api/amap/route/driving?strategy=11）：
 * - 响应不含策略标识字段，档位必须前端判定；
 * - 同一方案可同时命中多个档位（实测常见），需合并展示；
 * - partDesc 含完整转向文案，转向类型由文案解析。
 */
const buildPlan = (distance: string, time: string, lights: string, partDescs: string[]) => ({
  type: 'FeatureCollection',
  totalFeatures: String(partDescs.length),
  totalTime: time,
  totalDistance: distance,
  trafficLights: lights,
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
  features: partDescs.map((partDesc, index) => ({
    type: 'Feature',
    id: String(index + 1),
    geometry: {
      type: 'LineString',
      coordinates: [
        [113.95 + index * 0.001, 22.54],
        [113.951 + index * 0.001, 22.541],
      ],
    },
    properties: { distance: '100', partDesc, roadName: '深南大道', tmcs: [] },
  })),
})

const noTmc = () => ({ smoothRatio: 0, slowRatio: 0, jamRatio: 0, coverage: 0 })

describe('baseComponent/tools/routePlanOptions 多方案解析', () => {
  it('转向类型：按 partDesc 关键词判定，覆盖直行 / 左转 / 右转 / 掉头 / 稍偏 / 到达', () => {
    // Given 高德真实文案
    // When 解析转向类型
    const types = [
      parseTurnType('沿深南大道辅路向东行驶461米直行进入中间岔道'),
      parseTurnType('沿沙河东路向南行驶456米左转调头'),
      parseTurnType('沿沙河东路向东南行驶55米右转'),
      parseTurnType('沿北环沙河东立交向南行驶1.8千米向右前方行驶'),
      parseTurnType('沿侨航路向东北行驶279米靠左'),
      parseTurnType('沿侨航路向西北行驶200米到达目的地'),
    ]
    // Then 掉头优先于左转判定
    expect(types).toEqual(['straight', 'uturn', 'right', 'slight_right', 'slight_left', 'arrive'])
  })

  it('转向类型：「进入…」车道名后缀不改变转向判定（实测样本）', () => {
    // Given 高德真实文案：转向词在「进入」之前，车道名在后
    // When 逐条解析
    const turns = [
      parseTurnType('沿深南大道辅路途径深南大道向东行驶461米右转进入右转专用道'),
      parseTurnType('沿北环沙河东立交途径北环大道辅路向东行驶961米直行进入中间岔道'),
      parseTurnType('沿深南大道辅路途径深南大道向东行驶3.7千米向右前方行驶进入辅路'),
      parseTurnType('沿香山西街向东北行驶258米向右前方行驶进入右转专用道'),
    ]
    // Then 车道名被剔除，转向类型取「进入」之前的动作
    expect(turns).toEqual(['right', 'straight', 'slight_right', 'slight_right'])
  })

  it('转向指引：partDesc 缺失的 step 被跳过，其余保留原文', () => {
    // Given 含空 partDesc 的方案
    const plan = buildPlan('100', '60', '1', ['向北行驶1.3千米右转', '', '到达目的地'])
    // When 解析指引
    const steps = parseRouteSteps(plan as never)
    // Then 跳过空文案
    expect(steps).toHaveLength(2)
    expect(steps[0].partDesc).toBe('向北行驶1.3千米右转')
    expect(steps[1].turn).toBe('arrive')
  })

  it('方案切分：strategy=11 的数组响应被切分为多个方案', () => {
    // Given 代理返回的 RoutePlan[]
    const response = [
      buildPlan('6350', '1079', '10', ['向北行驶1.3千米右转']),
      buildPlan('6154', '999', '12', ['向东行驶800米左转']),
    ]
    // When 切分
    const plans = splitRoutePlans(response)
    // Then 每个方案独立
    expect(plans).toHaveLength(2)
    expect(plans[0].totalDistance).toBe('6350')
    expect(plans[1].totalDistance).toBe('6154')
  })

  it('档位判定：时间最短 / 距离最短分别命中不同方案', () => {
    // Given 三个方案的实测指标
    const metrics = [
      { distanceMeters: 6350, durationSeconds: 1079, jamRatio: 0 },
      { distanceMeters: 6154, durationSeconds: 999, jamRatio: 0 },
      { distanceMeters: 6062, durationSeconds: 1048, jamRatio: 0 },
    ]
    // When 判定档位
    const tiers = resolveOptionTiers(metrics)
    // Then 最短时长落在第二项，最短距离落在第三项
    expect(tiers[1]).toContain('fastest')
    expect(tiers[0]).not.toContain('fastest')
    expect(tiers[2]).toContain('shortest')
    // And 全线无拥堵差异时不打「躲避拥堵」标签（无区分度）
    expect(tiers.flat()).not.toContain('avoidJam')
  })

  it('档位判定：拥堵占比最小者命中躲避拥堵', () => {
    // Given 三个方案，仅拥堵占比不同
    const metrics = [
      { distanceMeters: 1000, durationSeconds: 100, jamRatio: 0.5 },
      { distanceMeters: 1200, durationSeconds: 120, jamRatio: 0.1 },
      { distanceMeters: 1300, durationSeconds: 130, jamRatio: 0.3 },
    ]
    // When 判定
    const tiers = resolveOptionTiers(metrics)
    // Then 第二项拥堵最少
    expect(tiers[1]).toContain('avoidJam')
    expect(tiers[0]).not.toContain('avoidJam')
  })

  it('档位判定：同一方案可同时命中多个档位（多标签合并展示）', () => {
    // Given 同时最短距离与最短时长的方案
    const metrics = [
      { distanceMeters: 1000, durationSeconds: 100, jamRatio: 0 },
      { distanceMeters: 1200, durationSeconds: 120, jamRatio: 0.1 },
    ]
    // When 判定
    const tiers = resolveOptionTiers(metrics)
    // Then 第一项同时命中两档
    expect(tiers[0]).toContain('fastest')
    expect(tiers[0]).toContain('shortest')
  })

  it('综合最优：时长与距离双归一化打分最优者', () => {
    // Given 一个既短又快、一个短但慢、一个快但长的方案
    const metrics = [
      { distanceMeters: 1000, durationSeconds: 100, jamRatio: 0 },
      { distanceMeters: 1000, durationSeconds: 300, jamRatio: 0 },
      { distanceMeters: 3000, durationSeconds: 100, jamRatio: 0 },
    ]
    // When 取综合最优
    const index = resolveBalancedIndex(metrics)
    // Then 第一项全维度占优
    expect(index).toBe(0)
  })

  it('多方案构建：返回 3 个方案，主档位标签与档位数组一致', () => {
    // Given 代理的 3 方案响应
    const response = [
      buildPlan('6350', '1079', '10', ['向北行驶1.3千米右转']),
      buildPlan('6154', '999', '12', ['向东行驶800米左转']),
      buildPlan('6062', '1048', '9', ['向南行驶500米调头']),
    ]
    // When 构建视图模型
    const options = buildRoutePlanOptions(response, noTmc)
    // Then 三个方案齐全，索引连续
    expect(options).toHaveLength(3)
    expect(options.map((item) => item.index)).toEqual([0, 1, 2])
    // Then 主档位文案非空，且是档位数组的成员
    options.forEach((option) => {
      expect(option.primaryLabel).toBeTruthy()
    })
    // Then 至少有一个方案命中「时间最短」与「距离最短」
    const allTiers = options.flatMap((option) => option.tiers)
    expect(allTiers).toContain('fastest')
    expect(allTiers).toContain('shortest')
  })

  it('多方案构建：空响应返回空数组，不抛异常', () => {
    // Given 空响应
    // When 构建
    const options = buildRoutePlanOptions([], noTmc)
    // Then 空数组
    expect(options).toEqual([])
  })

  it('多方案构建：路况指标口径与 summarizeTmc 一致（畅通率分母为有路况长度）', () => {
    // Given 带 TMC 的方案
    const plan = buildPlan('1000', '120', '2', ['向北行驶500米'])
    plan.features[0].properties.tmcs = [
      { distance: '300', status: '畅通', polyline: '113.95,22.54;113.96,22.55' },
      { distance: '100', status: '拥堵', polyline: '113.96,22.55;113.97,22.56' },
    ]
    // When 构建（注入真实口径计算器）
    const options = buildRoutePlanOptions([plan], (tmcs, totalDistanceMeters, durationSeconds) =>
      summarizeTmc(tmcs, { totalDistanceMeters, durationSeconds }),
    )
    // Then 分段长度按几何实算（两段等长），畅通率 = 50%
    // （GCJ-02 → WGS84 反向纠偏有微小误差，取 3 位精度）
    expect(options[0].smoothRatio).toBeCloseTo(0.5, 3)
    expect(options[0].jamRatio).toBeCloseTo(0.5, 3)
    // And 覆盖度 = 有路况长度 / 全路长度（几何长度远大于 totalDistance）
    expect(options[0].coverage).toBe(1)
  })
})
