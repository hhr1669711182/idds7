import { describe, expect, it } from 'vitest'
import { buildRouteAnalysis, compareCandidates, ensureSegmentContinuity } from '@/baseComponent/tools/routeAnalysis'
import { normalizeTmcLevel, summarizeTmc } from '@/baseComponent/amap/routeCongestion'
import { distanceMeters } from '@/baseComponent/amap/routeMetrics'

/**
 * 路径分析契约：
 * 路况等级必须可从数字编码与文案两种形态归一；
 * 未知路况必须单列、不并入畅通（否则高估畅通占比）；
 * 候选推荐按「拥堵优先、时长次之」；
 * 路段衔接必须补点且不产生重复点。
 */
describe('baseComponent/tools/routeAnalysis 路径分析', () => {
  it('路况等级归一：数字编码、中文文案、英文标识与未知分别落到对应等级', () => {
    // Given 高德返回的多种等级形态
    // When 逐个归一
    const levels = [
      normalizeTmcLevel('1'),
      normalizeTmcLevel('畅通'),
      normalizeTmcLevel('smooth'),
      normalizeTmcLevel('3'),
      normalizeTmcLevel('拥堵'),
      normalizeTmcLevel('4'),
      normalizeTmcLevel('严重拥堵'),
      normalizeTmcLevel('jam'),
      normalizeTmcLevel(''),
      normalizeTmcLevel(undefined),
      normalizeTmcLevel('不认识的文案'),
    ]
    // Then 未知形态一律落到 unknown，不并入畅通
    expect(levels).toEqual([
      'smooth',
      'smooth',
      'smooth',
      'jam',
      'jam',
      'serious_jam',
      'serious_jam',
      'jam',
      'unknown',
      'unknown',
      'unknown',
    ])
    // 回归：herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §10（TMC 缺省兜底）
  })

  it('路况汇总：畅通 / 缓行 / 拥堵 / 未知占比按段长度分配，未知单列', () => {
    // Given 三段等长路况：畅通、拥堵、未知
    const segments = [
      { status: '1', polyline: [[0, 0] as [number, number], [0, 0.01] as [number, number]] },
      { status: '3', polyline: [[0, 0.01] as [number, number], [0, 0.02] as [number, number]] },
      { status: '', polyline: [[0, 0.02] as [number, number], [0, 0.03] as [number, number]] },
    ]
    // When 汇总指标
    const metrics = summarizeTmc(segments)
    // Then 三段等长，占比各约三分之一
    expect(metrics.smoothRatio).toBeCloseTo(1 / 3, 2)
    expect(metrics.jamRatio).toBeCloseTo(1 / 3, 2)
    expect(metrics.unknownRatio).toBeCloseTo(1 / 3, 2)
    expect(metrics.slowRatio).toBe(0)
    expect(metrics.coverage).toBe(1)
  })

  it('路况汇总：缺失路段拉低覆盖度，且不计入畅通', () => {
    // Given 只有一段路况数据，总路长是路况覆盖长度的两倍
    const segment = {
      status: '1',
      polyline: [[0, 0] as [number, number], [0, 0.01] as [number, number]],
    }
    const coveredDistance = distanceMeters(segment.polyline[0], segment.polyline[1])
    // When 按两倍总长汇总
    const metrics = summarizeTmc([segment], { totalDistanceMeters: coveredDistance * 2, durationSeconds: 600 })
    // Then 覆盖度约 50%，畅通占比仍为 100%（分母是已覆盖长度）
    expect(metrics.coverage).toBeCloseTo(0.5, 2)
    expect(metrics.smoothRatio).toBe(1)
    // 回归：同方案 §10（unknown 不并入畅通）
  })

  it('构建分析结果：距离缺省时按坐标实算，时长与路况一并带出', () => {
    // Given 一段两点的路线与一段路况
    const path: [number, number][] = [
      [0, 0],
      [0, 0.01],
    ]
    // When 构建分析结果
    const analysis = buildRouteAnalysis({
      path,
      tmcs: [{ status: '2', polyline: path }],
      durationSeconds: 300,
      candidateRank: 0,
    })
    // Then 距离与实算一致，路况覆盖完整
    expect(analysis.distanceMeters).toBeCloseTo(distanceMeters(path[0], path[1]), 3)
    expect(analysis.durationSeconds).toBe(300)
    expect(analysis.candidateRank).toBe(0)
    expect(analysis.tmc.coverage).toBe(1)
    expect(analysis.tmc.slowRatio).toBe(1)
    expect(analysis.segments.length).toBe(1)
  })

  it('候选对比：拥堵占比最低者被标为推荐，拥堵相同则时长更短者胜出', () => {
    // Given 三个候选方案
    const candidates = [
      { id: 'a', label: '方案 A', distanceMeters: 1000, durationSeconds: 300, jamRatio: 0.3 },
      { id: 'b', label: '方案 B', distanceMeters: 1200, durationSeconds: 200, jamRatio: 0.1 },
      { id: 'c', label: '方案 C', distanceMeters: 900, durationSeconds: 400, jamRatio: 0.3 },
    ]
    // When 对比
    const result = compareCandidates(candidates)
    // Then 拥堵最低的 B 被标为推荐
    expect(result.find((item) => item.recommended)?.id).toBe('b')
    expect(result.length).toBe(3)
    // 空候选不报错
    expect(compareCandidates([])).toEqual([])
  })

  it('路段衔接：段末点与下段首点不重合时补点，重合时不补', () => {
    // Given 两段中间有缺口的路况
    const first = {
      status: '1',
      polyline: [[0, 0] as [number, number], [0, 0.01] as [number, number]],
    }
    const second = {
      status: '3',
      polyline: [[0, 0.02] as [number, number], [0, 0.03] as [number, number]],
    }
    // When 做连续性处理
    const result = ensureSegmentContinuity([first, second])
    // Then 第一段末尾补上了第二段首点，几何连续
    expect(result[0].polyline.length).toBe(3)
    expect(result[0].polyline[2]).toEqual(second.polyline[0])
    expect(distanceMeters(result[0].polyline[2], result[1].polyline[0])).toBeLessThan(0.001)
    // 入参不被修改
    expect(first.polyline.length).toBe(2)
  })

  it('路段衔接：首尾本就重合时不产生重复点', () => {
    // Given 两段首尾重合的路况
    const first = {
      status: '1',
      polyline: [[0, 0] as [number, number], [0, 0.01] as [number, number]],
    }
    const second = {
      status: '3',
      polyline: [[0, 0.01] as [number, number], [0, 0.02] as [number, number]],
    }
    // When 做连续性处理
    const result = ensureSegmentContinuity([first, second])
    // Then 不补重复点
    expect(result[0].polyline.length).toBe(2)
  })
})
