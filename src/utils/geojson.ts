// 用途：GeoJSON 几何读取工具（类型收窄 + 点坐标提取）。
// 见 herness/05-共享上下文/公共工具速查.md

/**
 * 取出 GeoJSON 点几何的坐标。
 * 非点几何（面/线/集合）或坐标缺失时返回 null，调用方据此判定「无点坐标」。
 */
export const readPointCoordinates = (geometry?: GeoJSON.Geometry | null): [number, number] | null => {
  if (!geometry) return null
  if (geometry.type !== 'Point') return null
  const coordinates = geometry.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const longitude = Number(coordinates[0])
  const latitude = Number(coordinates[1])
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return [longitude, latitude]
}
