function getGeometryTier(feature) {
  const type = feature.getGeometry()?.getType()
  if (!type) return 0
  if (type === 'Point' || type === 'MultiPoint') return 3
  if (type === 'LineString' || type === 'MultiLineString') return 2
  if (type === 'Polygon' || type === 'MultiPolygon') return 1
  return 0
}

const ROLE_RANK = {
  anchor: 1,
  anchor_candidate: 2,
  candidate: 3,
}

function getRoleRank(feature) {
  return ROLE_RANK[feature.get?.('role')] ?? 0
}

/**
 * OpenLayers renderOrder：值越小越先绘制（在下方）。
 * 顺序：大面 < 小面 < 线 < 点；同类型点要素按 role 候选优先。
 */
export function featureRenderOrder(featureA, featureB) {
  const tierA = getGeometryTier(featureA)
  const tierB = getGeometryTier(featureB)
  if (tierA !== tierB) return tierA - tierB

  if (tierA === 1) {
    const areaA = featureA.getGeometry()?.getArea?.() ?? 0
    const areaB = featureB.getGeometry()?.getArea?.() ?? 0
    return areaB - areaA
  }

  const roleA = getRoleRank(featureA)
  const roleB = getRoleRank(featureB)
  if (roleA !== roleB) return roleA - roleB

  return 0
}
