/**
 * 围栏（Fence）几何约束
 *
 * 业务规则：
 * 1. 围栏之间不允许有面积交叠（有重叠面积即违规）
 * 2. 允许贴边与贴角：共用一条边或共用一个角点时不算违规
 *    - 贴边：顶点吸附到邻边任意位置，两条边部分重合
 *    - 贴角：顶点吸附到邻围栏的角点，两个多边形的这个角完全对齐
 * 3. 靠近时默认吸附：先试贴角（角点意图更明确），无角可贴时退化为贴边
 * 4. 拖拽结束与保存前都要校验，违规则回滚 / 拦截
 *
 * 坐标口径：全链路统一 EPSG:4326（经纬度），
 * 与展示和数据库一致，不再各自维护一套 3857 换算。
 *
 * 实现基于 @turf/turf：
 * - booleanIntersects 判断是否相交（含共享边）
 * - intersect 求真实交叠区域；共享边时交集退化为线 → 面积 0 → 视为纯贴边，放行
 *
 * 面积单位：turf 的 area() 直接返回「平方米」，不要再乘任何换算系数。
 */
import {
  along as turfAlong,
  area as turfArea,
  booleanIntersects,
  featureCollection,
  intersect,
  length as turfLength,
  lineString as turfLine,
  polygon as turfPolygon,
} from '@turf/turf'
import type { CoordArray } from '../engine/types'

/** 容差（平方米）：交叠面积低于该值视为纯贴边，不算违规 */
export const FENCE_TOLERANCE_AREA = 1e-6

/** 贴边吸附容差（米）：顶点到邻边距离小于该值时吸附 */
export const SNAP_TOLERANCE_M = 1
/** 贴角吸附容差（米）：顶点到邻围栏顶点的距离小于该值时吸附（共用同一个角点） */
export const SNAP_VERTEX_TOLERANCE_M = 1.5

/** 一个纬度对应的米数：用于把经纬度距离换算成米（吸附判定） */
const M_PER_DEG_LAT = 110574

export interface FenceViolation {
  /** 冲突的其它围栏 id */
  otherId: string | number
  /** 交叠面积（平方米） */
  overlapArea: number
  /** 提示文案 */
  message: string
}

export interface FenceCheckResult {
  ok: boolean
  violations: FenceViolation[]
}

/* ------------------------------------------------------------------ *
 * 坐标嵌套结构工具
 * ------------------------------------------------------------------ */

/** 计算坐标嵌套深度：Point=1, Line=2, Polygon=3, MultiPolygon=4 */
const detectDepth = (v: unknown): number => {
  if (!Array.isArray(v) || v.length === 0) return 0
  if (typeof v[0] === 'number') return 1
  return 1 + detectDepth(v[0])
}

/** 判断是否为合法的二维点 [lon, lat] */
const isXY = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number'

/**
 * 取所有外环（LinearRing，即一串二维点）。
 * - Polygon      → depth 3：[ring]，取最外层包装里的那个 ring
 * - MultiPolygon → depth 4：[poly][ring]，取每个 poly 的第一个 ring
 * 层级错一档，turf 会算出 0 面积，真实交叠就会被判成「不重叠」——围栏约束形同虚设。
 */
const ringsOf = (c: CoordArray): number[][][] => {
  const depth = detectDepth(c)
  if (depth >= 4) return (c as unknown as number[][][][]).map((poly) => poly[0])
  if (depth === 3) return [(c as unknown as number[][][])[0]]
  return []
}

/* ------------------------------------------------------------------ *
 * 交叠判定
 * ------------------------------------------------------------------ */

/** 把外环（经纬度）转成 turf Polygon：确保闭合且面积为正 */
const toTurfPolygon = (ring4326: number[][]): ReturnType<typeof turfPolygon> | null => {
  if (!Array.isArray(ring4326) || ring4326.length < 3) return null
  if (!ring4326.every(isXY)) return null
  const ring = ring4326.map((p) => [p[0], p[1]] as [number, number])
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first])
  try {
    const poly = turfPolygon([ring])
    // 面积为 0 说明是退化多边形（点/线），不参与围栏交叠判定
    if (turfArea(poly) === 0) return null
    return poly
  } catch {
    return null
  }
}

/**
 * 计算两个围栏之间的真实交叠面积（平方米）。
 * 纯贴边（交集退化为线或空）时返回 0。
 */
export const overlapAreaOf = (a4326: CoordArray, b4326: CoordArray): number => {
  const aRings = ringsOf(a4326)
  const bRings = ringsOf(b4326)
  if (!aRings.length || !bRings.length) return 0

  // MultiPolygon 有多个面，两两求交集后取面积最大值
  let maxAreaM2 = 0
  for (const aRing of aRings) {
    const a = toTurfPolygon(aRing)
    if (!a) continue
    for (const bRing of bRings) {
      const b = toTurfPolygon(bRing)
      if (!b) continue
      if (!booleanIntersects(a, b)) continue
      try {
        // 共享边时交集退化为线，intersect 返回 null → 视为纯贴边，放行
        const inter = intersect(featureCollection([a, b]))
        if (!inter) continue
        const areaM2 = turfArea(inter)
        if (areaM2 > maxAreaM2) maxAreaM2 = areaM2
      } catch {
        /* 单对求交失败不影响其它对 */
      }
    }
  }
  if (maxAreaM2 <= FENCE_TOLERANCE_AREA) return 0
  // turf 的 area() 已经是平方米，直接返回
  return maxAreaM2
}

/**
 * 校验某个围栏与同层其它围栏是否冲突。
 * @param target 当前围栏坐标（4326）
 * @param others 同层其它围栏（4326）
 */
export const validateFence = (
  target: CoordArray,
  others: Array<{ id: string | number; coords: CoordArray }>,
): FenceCheckResult => {
  const violations: FenceViolation[] = []
  for (const other of others) {
    const overlap = overlapAreaOf(target, other.coords)
    if (overlap > FENCE_TOLERANCE_AREA) {
      violations.push({
        otherId: other.id,
        overlapArea: overlap,
        message: `与围栏 ${other.id} 重叠约 ${overlap.toFixed(1)} m²`,
      })
    }
  }
  return { ok: violations.length === 0, violations }
}

/* ------------------------------------------------------------------ *
 * 贴边吸附
 * ------------------------------------------------------------------ */

/** 在一条经纬度折线上找距 (lon,lat) 最近、且不超过 tol 米的点 */
const snapOnLine = (
  line: ReturnType<typeof turfLine>,
  lon: number,
  lat: number,
  tolMeters: number,
): [number, number] | null => {
  const total = turfLength(line, { units: 'meters' })
  if (!total) return null
  const STEPS = 240
  let bestDist = Infinity
  let bestPos = 0
  const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180)
  for (let i = 0; i <= STEPS; i++) {
    const pos = (total * i) / STEPS
    const p = turfAlong(line, pos, { units: 'meters' }).geometry.coordinates as [number, number]
    const d = Math.hypot((p[0] - lon) * mPerDegLon, (p[1] - lat) * M_PER_DEG_LAT)
    if (d < bestDist) {
      bestDist = d
      bestPos = pos
    }
  }
  if (bestDist > tolMeters) return null
  return turfAlong(line, bestPos, { units: 'meters' }).geometry.coordinates as [number, number]
}

/** 单个 4326 顶点吸附到某条边线上 */
const snapVertex = (
  p: [number, number],
  lines: Array<ReturnType<typeof turfLine>>,
  tol: number,
): [number, number] | null => {
  const [lon, lat] = p
  let best: [number, number] | null = null
  let bestDist = tol
  for (const line of lines) {
    const snapped = snapOnLine(line, lon, lat, tol)
    if (!snapped) continue
    const d = Math.hypot(
      (snapped[0] - lon) * 111320 * Math.cos((lat * Math.PI) / 180),
      (snapped[1] - lat) * M_PER_DEG_LAT,
    )
    if (d < bestDist) {
      bestDist = d
      best = snapped
    }
  }
  return best
}

/** 预先把所有邻边转成 turf line，避免逐顶点重复转换 */
const toNeighbourLines = (neighbours: CoordArray[]): Array<ReturnType<typeof turfLine>> => {
  const lines: Array<ReturnType<typeof turfLine>> = []
  for (const n of neighbours) {
    for (const ring of ringsOf(n)) {
      if (ring.length < 2) continue
      const pts = ring.filter(isXY).map((p) => [p[0], p[1]] as [number, number])
      if (pts.length >= 2) lines.push(turfLine(pts))
    }
  }
  return lines
}

/**
 * 贴角吸附：把当前围栏的顶点吸附到邻围栏的「顶点」上，
 * 使两者的这个角共用同一个经纬度点（而不是各自独立的一组坐标）。
 *
 * 与贴边的区别：
 * - 贴边吸附到邻边的任意位置，两条边部分重合
 * - 贴角吸附到邻围栏的角点，两个多边形的这个角完全对齐
 *
 * 贴角优先于贴边：角点位置是明确的，先吸附角能避免后续再被边吸附拉到别处。
 *
 * @param target 当前围栏坐标（4326）
 * @param neighbours 同层其它围栏坐标（4326）
 * @param tol 容差（米）
 * @returns 吸附后的坐标；未发生吸附时返回原引用
 */
export const snapToNeighbourVertices = (
  target: CoordArray,
  neighbours: CoordArray[],
  tol: number = SNAP_VERTEX_TOLERANCE_M,
): CoordArray => {
  if (neighbours.length === 0) return target

  // 收集邻围栏的所有外环顶点
  const points: Array<[number, number]> = []
  for (const n of neighbours) {
    for (const ring of ringsOf(n)) {
      ring.filter(isXY).forEach((p) => points.push([p[0], p[1]]))
    }
  }
  if (points.length === 0) return target

  // 逐环吸附，保持闭合环的首尾一致（不能各自独立吸附，否则环会被拉成不闭合）
  const walkRing = (ring: number[][]): number[][] => {
    const n = ring.length
    if (n < 3) return ring
    const first = ring[0]
    const last = ring[n - 1]
    const isClosed = n > 3 && first[0] === last[0] && first[1] === last[1]

    const snapPoint = (p: number[]): [number, number] => {
      const lon = p[0]
      const lat = p[1]
      const mPerDegLon = 111320 * Math.cos((lat * Math.PI) / 180)
      let best: [number, number] | null = null
      let bestDist = tol
      for (const point of points) {
        const d = Math.hypot((point[0] - lon) * mPerDegLon, (point[1] - lat) * M_PER_DEG_LAT)
        if (d < bestDist) {
          bestDist = d
          best = point
        }
      }
      return best ?? [lon, lat]
    }

    const out = ring.map((p, i) => {
      // 闭合环的末点不单独吸附，交给首点结果复用
      if (isClosed && i === n - 1) return p
      const snapped = snapPoint(p)
      return [snapped[0], snapped[1]]
    })

    if (isClosed) {
      // 末点跟随首点，保证环仍然闭合
      const snappedFirst = out[0] as number[]
      out[n - 1] = [snappedFirst[0], snappedFirst[1]]
    }
    return out
  }

  const walk = (node: unknown): unknown => {
    // 命中一个完整环（环的元素是 [lon,lat] 而不是数字）
    if (Array.isArray(node) && node.length > 0 && isXY(node[0])) {
      return walkRing(node as number[][])
    }
    if (Array.isArray(node)) return node.map(walk)
    return node
  }

  const next = walk(target) as CoordArray
  return JSON.stringify(next) === JSON.stringify(target) ? target : next
}

/**
 * 围栏吸附总入口：先试贴角，再试贴边。
 * 贴角优先 —— 角点是明确的对齐意图，先锁定角能避免被边吸附拉到中间位置。
 *
 * @param target 当前围栏坐标（4326）
 * @param neighbours 同层其它围栏坐标（4326）
 * @returns 吸附后的坐标；未发生吸附时返回原引用
 */
export const snapFenceToNeighbours = (target: CoordArray, neighbours: CoordArray[]): CoordArray => {
  if (neighbours.length === 0) return target
  // 贴角优先
  const byVertex = snapToNeighbourVertices(target, neighbours)
  if (byVertex !== target) return byVertex
  // 没有可吸附的角，退化到贴边
  return snapToNeighbourEdges(target, neighbours, SNAP_TOLERANCE_M)
}

/**
 * 贴边吸附：把当前围栏的顶点吸附到相邻围栏已有边上，
 * 使两者共用同一条边（同一组经纬度），从而「贴边」而不是「交叠」。
 *
 * @param target 当前围栏坐标（4326）
 * @param neighbours 同层其它围栏坐标（4326）
 * @param tol 容差（米）
 * @returns 吸附后的坐标；未发生吸附时返回原引用
 */
export const snapToNeighbourEdges = (
  target: CoordArray,
  neighbours: CoordArray[],
  tol: number = SNAP_TOLERANCE_M,
): CoordArray => {
  if (neighbours.length === 0) return target
  const lines = toNeighbourLines(neighbours)
  if (lines.length === 0) return target

  const walkRing = (ring: number[][]): number[][] => {
    const n = ring.length
    if (n < 2) return ring
    const isClosed = n > 3 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]

    const out = ring.map((p, i2) => {
      if (isClosed && i2 === n - 1) return p
      const snapped = snapVertex([p[0], p[1]], lines, tol)
      return snapped ?? ([p[0], p[1]] as [number, number])
    }) as number[][]

    if (isClosed) {
      const snappedFirst = out[0]
      out[n - 1] = [snappedFirst[0], snappedFirst[1]]
    }
    return out
  }

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node) && node.length > 0 && isXY(node[0])) {
      return walkRing(node as number[][])
    }
    if (Array.isArray(node)) return node.map(walk)
    return node
  }
  const next = walk(target) as CoordArray
  return JSON.stringify(next) === JSON.stringify(target) ? target : next
}

/**
 * 从 OL Geometry 直接取坐标（保留地图内部的 3857 原样）。
 * 需要 4326 展示 / 校验 / 落库口径时，由调用方用 geometryToLngLat 转换。
 */
export const coordsOfGeometry = (geom: unknown): CoordArray | null => {
  if (!geom) return null
  const getter = (geom as { getCoordinates?: () => unknown }).getCoordinates
  if (typeof getter !== 'function') return null
  const coords = getter.call(geom)
  return Array.isArray(coords) ? (coords as CoordArray) : null
}
