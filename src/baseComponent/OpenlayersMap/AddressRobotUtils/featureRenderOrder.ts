/**
 * 地址机器人搜索要素的渲染顺序（OpenLayers renderOrder）。
 */
import type { FeatureLike } from 'ol/Feature'
import type { OrderFunction } from 'ol/render'
import type { AddressRobotRole } from './addressRobotPalette'

/**
 * 几何类型分层：值越大越后绘制（越靠上）。
 * 面在下、线居中、点在最上，保证点标记不被面遮挡。
 */
const getGeometryTier = (feature: FeatureLike): number => {
  const type = feature.getGeometry()?.getType()
  if (!type) return 0
  if (type === 'Point' || type === 'MultiPoint') return 3
  if (type === 'LineString' || type === 'MultiLineString') return 2
  if (type === 'Polygon' || type === 'MultiPolygon') return 1
  return 0
}

/** 参与同层点要素排序的 role（search_area 是面要素，不进此表） */
type RankedRole = Exclude<AddressRobotRole, 'search_area'>

/** role → 同层点要素的绘制优先级（值越小越先绘制） */
const ROLE_RANK: Record<RankedRole, number> = {
  anchor: 1,
  anchor_candidate: 2,
  candidate: 3,
}

const getRoleRank = (feature: FeatureLike): number => {
  const role = feature.get?.('role') as AddressRobotRole | undefined
  if (!role || role === 'search_area') return 0
  return ROLE_RANK[role]
}

/**
 * 取面要素面积；非面几何或取不到时按 0 处理。
 * RenderFeature 没有 getArea，故按 Geometry 接口收窄后调用。
 */
const getPolygonArea = (feature: FeatureLike): number => {
  const geometry = feature.getGeometry() as unknown as { getArea?: () => number } | undefined
  if (!geometry || typeof geometry.getArea !== 'function') return 0
  const area = geometry.getArea()
  return Number.isFinite(area) ? area : 0
}

/**
 * OpenLayers renderOrder：值越小越先绘制（在下方）。
 * 顺序：大面 < 小面 < 线 < 点；同类型点要素按 role 候选优先。
 */
export const featureRenderOrder: OrderFunction = (featureA: FeatureLike, featureB: FeatureLike): number => {
  const tierA = getGeometryTier(featureA)
  const tierB = getGeometryTier(featureB)
  if (tierA !== tierB) return tierA - tierB

  if (tierA === 1) {
    const areaA = getPolygonArea(featureA)
    const areaB = getPolygonArea(featureB)
    return areaB - areaA
  }

  const roleA = getRoleRank(featureA)
  const roleB = getRoleRank(featureB)
  if (roleA !== roleB) return roleA - roleB

  return 0
}
