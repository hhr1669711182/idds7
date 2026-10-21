import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { toStationCandidates } from '@/controller/core/business/IncidentStationQuery'
import { toNearbyResources } from '@/controller/core/business/IncidentNearbyResourceQuery'

vi.mock('@/apis/geoserver', () => ({ geoserverApi: { getWFSFeatures: vi.fn() } }))

describe('F1 engine independent query boundary', () => {
  it('Given business 查询 When 检查依赖 Then 不引用 OL/Three；回归 F1 分层', () => {
    for (const name of ['IncidentStationQuery', 'IncidentNearbyResourceQuery']) {
      const source = readFileSync(resolve(`src/controller/core/business/${name}.ts`), 'utf8')
      expect(source).not.toMatch(/from\s+['"](?:ol\/|three(?:\/|['"]))/)
    }
  })

  it('Given WGS84 候选 When 排序与去重 Then 保留米制球面距离、最近 ID；回归 F1 查询语义', () => {
    const features = [
      { properties: { id: 'far', longitude: 2, latitude: 0 } },
      { properties: { id: 'near', longitude: 1, latitude: 0 } },
      { properties: { id: 'near', longitude: 3, latitude: 0 } },
    ]
    const stations = toStationCandidates(features, [0, 0])
    expect(stations.map((station) => station.id)).toEqual(['near', 'far'])
    expect(stations[0].distanceMeters).toBeCloseTo(111195.08, 2)
    const resources = toNearbyResources(features, [0, 0], 'fireHydrant', ['name'], ['address'])
    expect(resources.map((resource) => resource.id)).toEqual(['near', 'far'])
    expect(resources[0].distanceMeters).toBeCloseTo(stations[0].distanceMeters, 6)
  })
})
