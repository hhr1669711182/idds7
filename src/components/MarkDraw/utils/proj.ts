/**
 * 投影与坐标工具。
 *
 * 约定（全链路统一，消除到处换算）：
 * - 地图内部几何 = EPSG:3857（OL 渲染必需）
 * - 几何数据展示 = EPSG:4326（经纬度，业务与数据库口径）
 * - WFS-T 落库 = EPSG:4326（srsName 直接写 4326，不再 3857）
 *
 * 读取链路只做一次 4326 → 3857 给 OL 上图：
 *   WFS(4326) ──readGeoJson──▶ OL Geometry(3857) ──geometryToLngLat──▶ 展示(4326)
 * 落库链路直接用展示口径的 4326，不再从 3857 反算：
 *   表单几何(4326) ──▶ WFS-T(srsName=4326)
 */
import { transform } from 'ol/proj'
import type { Geometry } from 'ol/geom'
import GeoJSON from 'ol/format/GeoJSON'
import type { CoordArray } from '../engine/types'

export const toLngLat = (coord3857: number[]): [number, number] => {
  const [lon, lat] = transform(coord3857, 'EPSG:3857', 'EPSG:4326')
  return [lon, lat]
}

export const toMercator = (coord4326: [number, number]): [number, number] => {
  const [x, y] = transform([coord4326[0], coord4326[1]], 'EPSG:4326', 'EPSG:3857')
  return [x, y]
}

/**
 * 任意嵌套坐标从 3857 → 4326（用于把地图几何转成展示/落库口径）。
 * Point [x,y] / LineString [x,y][] / Polygon [x,y][][] / MultiPolygon [x,y][][][]
 */
const convertTo4326 = (node: unknown): unknown => {
  if (!Array.isArray(node)) return node
  if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
    return toLngLat(node as number[])
  }
  return node.map(convertTo4326)
}

/** 任意嵌套坐标 3857 → 4326 */
export const geometryToLngLat = (g3857: CoordArray): CoordArray => {
  if (!g3857 || (Array.isArray(g3857) && g3857.length === 0)) return g3857
  return convertTo4326(g3857) as CoordArray
}

/**
 * 任意嵌套坐标 4326 → 3857（把表单/数据库口径的经纬度写回 OL 几何）。
 * 与 geometryToLngLat 严格互逆。
 */
const convertTo3857 = (node: unknown): unknown => {
  if (!Array.isArray(node)) return node
  if (node.length >= 2 && typeof node[0] === 'number' && typeof node[1] === 'number') {
    return toMercator([node[0], node[1]])
  }
  return node.map(convertTo3857)
}

/** 任意嵌套坐标 4326 → 3857 */
export const lngLatToMercator = (g4326: CoordArray): CoordArray => {
  if (!g4326 || (Array.isArray(g4326) && g4326.length === 0)) return g4326
  return convertTo3857(g4326) as CoordArray
}

/**
 * 把 WFS 返回的 GeoJSON FeatureCollection 读成 OL Geometry(3857)。
 * 这是唯一一处 4326 → 3857 的转换入口：WFS 出 4326，OL 要 3857。
 * featureProjection 传 EPSG:3857 后，OL 自动完成轴序与投影处理。
 */
export const readGeoJsonAsMercator = (raw: unknown): Geometry[] => {
  const fmt = new GeoJSON({
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  })
  const features = fmt.readFeatures(raw as never)
  return features.map((f) => f.getGeometry()).filter((g): g is Geometry => !!g)
}
