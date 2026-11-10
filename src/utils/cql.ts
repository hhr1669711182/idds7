// 用途：CQL 条件构造统一入口（空间过滤 / 字面量转义 / 多图层拼接）。
// 见 herness/02-技术设计/前端/GIS-W46-路径分析与GeoServer加固-技术方案.md §5.2
import { circle as turfCircle } from '@turf/turf'
import type { LngLat } from '@/utils/coordTransform'

/** 测地圆多边形顶点数：与既有警情周边资源查询一致。 */
const GEODESIC_CIRCLE_STEPS = 64

/**
 * 转义 CQL 字符串字面量中的单引号。
 * GeoServer 的 CQL 用单引号包字符串，未转义会同时造成语法错误与注入风险。
 */
export const buildLiteral = (value: string): string => String(value ?? '').replace(/'/g, "''")

/** 按半径生成测地圆 WKT 多边形（lon/lat 轴序，EPSG:4326）。 */
export const buildGeodesicCircleWkt = (center: LngLat, radiusMeters: number, steps = GEODESIC_CIRCLE_STEPS): string => {
  const circlePoly = turfCircle(center, radiusMeters / 1000, { steps, units: 'kilometers' })
  const ring = circlePoly.geometry.coordinates[0].map(([lng, lat]) => `${lng} ${lat}`).join(', ')
  return `POLYGON((${ring}))`
}

/**
 * 圆面与要素几何相交的 CQL 条件。
 * 加 SRID=4326 前缀强制 lon/lat 轴序，规避 WFS/WMS 1.1.0 的 lat/lon 默认轴序导致过滤失效。
 */
export const buildCircleIntersectsCql = (geomField: string, center: LngLat, radiusMeters: number): string =>
  `INTERSECTS(${geomField},SRID=4326;${buildGeodesicCircleWkt(center, radiusMeters)})`

/**
 * 圆心距离过滤的 CQL 条件。
 * 该 GeoServer 实测 DWITHIN(...meters) 距离计算不可靠，仅在明确需要该语义时使用。
 * @param center 圆心经纬度 [经, 纬]
 * @param radiusMeters 半径（米）
 * @param geomField 空间字段名；默认 geom，辖区等图层可传 zone_geom
 */
export const buildDwithinCql = (center: LngLat, radiusMeters: number, geomField = 'geom'): string =>
  `DWITHIN(${geomField}, Point(${center[0]} ${center[1]}),${radiusMeters},meters)`

/** 视口范围（BBOX）。GeoServer 的 BBOX 参数顺序为 minx,miny,maxx,maxy。 */
export const buildViewportCql = (viewport: [number, number, number, number]): string =>
  `BBOX(geom, ${viewport[0]}, ${viewport[1]}, ${viewport[2]}, ${viewport[3]}, 'EPSG:4326')`

/** 关键词模糊匹配（字段统一为 name，不做字段探查）。 */
export const buildKeywordCql = (keyword: string): string =>
  `strToLowerCase(name) LIKE '%${buildLiteral(keyword.trim().toLowerCase())}%'`

/** 多图层 WMS 的 CQL 占位：按图层数用 ';' 分隔，空条件退化为不过滤。 */
export const buildMultiLayerCql = (filters: string[]): string => (filters.length ? filters.join(';') : '1=1')

/** 把多个条件用 AND 串成一个 CQL；空条件返回 1=1（不过滤）。 */
export const combineCql = (...parts: (string | undefined)[]): string => {
  const valid = parts.filter((part): part is string => !!part && part !== '1=1')
  return valid.length ? valid.join(' AND ') : '1=1'
}
