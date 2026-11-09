import { describe, expect, it } from 'vitest'
import {
  buildCircleIntersectsCql,
  buildDwithinCql,
  buildGeodesicCircleWkt,
  buildKeywordCql,
  buildLiteral,
  buildMultiLayerCql,
  buildViewportCql,
  combineCql,
} from '@/utils/cql'

/**
 * CQL 构造统一入口契约：
 * 单引号必须转义（注入与语法错误）、空间过滤轴序必须显式指定、
 * 多图层占位数量必须与图层数一致、空条件必须退化为不过滤。
 */
describe('utils/cql CQL 构造', () => {
  it('字面量转义：单引号双写，不破坏原值语义', () => {
    // Given 一段含单引号的输入
    const raw = "O'Brien 队站"
    // When 走统一转义入口
    const literal = buildLiteral(raw)
    // Then 单引号被双写
    expect(literal).toBe("O''Brien 队站")
    // 回归：herness/05-共享上下文/当前状态摘要.md（区划码非前缀关系，走 IN 列表）
  })

  it('关键词条件：转义后拼进 LIKE，且字段统一为 name', () => {
    // Given 关键词含单引号
    const keyword = "a'b"
    // When 构造关键词 CQL
    const cql = buildKeywordCql(keyword)
    // Then 单引号已转义且整体匹配 LIKE 形态
    expect(cql).toBe("strToLowerCase(name) LIKE '%a''b%'")
  })

  it('视口条件：BBOX 参数顺序为 minx,miny,maxx,maxy 且带 EPSG:4326', () => {
    // Given 视口四元组
    const viewport: [number, number, number, number] = [116.1, 39.2, 116.5, 39.8]
    // When 构造视口 CQL
    const cql = buildViewportCql(viewport)
    // Then 顺序与坐标系声明正确
    expect(cql).toBe("BBOX(geom, 116.1, 39.2, 116.5, 39.8, 'EPSG:4326')")
  })

  it('圈选条件：INTERSECTS 带 SRID=4326 前缀强制 lon/lat 轴序', () => {
    // Given 圆心与半径
    const center: [number, number] = [116.4074, 39.9042]
    // When 构造圆面相交 CQL
    const cql = buildCircleIntersectsCql('geom', center, 500)
    // Then 用 INTERSECTS 而非 DWITHIN，且带 SRID 前缀
    expect(cql.startsWith('INTERSECTS(geom,SRID=4326;POLYGON((')).toBe(true)
    expect(cql.endsWith('))')).toBe(true)
    expect(cql).not.toContain('DWITHIN')
    // 回归：IncidentNearbyResourceQuery.ts 既有实测结论（DWITHIN 在该 GeoServer 不可靠）
  })

  it('测地圆 WKT：顶点数固定且首尾闭合', () => {
    // Given 圆心与半径
    const center: [number, number] = [116.4074, 39.9042]
    // When 生成 WKT
    const wkt = buildGeodesicCircleWkt(center, 500)
    // Then 是合法 POLYGON 形态
    expect(wkt.startsWith('POLYGON((')).toBe(true)
    expect(wkt.endsWith('))')).toBe(true)
    const ring = wkt.slice('POLYGON(('.length, -2).split(', ')
    expect(ring.length).toBeGreaterThan(32)
    expect(ring[0]).toBe(ring[ring.length - 1])
  })

  it('DWITHIN 保留为独立入口但不作默认口径', () => {
    // Given 圆心与半径
    const center: [number, number] = [116.4074, 39.9042]
    // When 构造 DWITHIN 条件
    const cql = buildDwithinCql(center, 500)
    // Then 语义仍是圆心距离
    expect(cql).toBe('DWITHIN(geom, Point(116.4074 39.9042),500,meters)')
  })

  it('多图层占位：按图层数用分号分隔，空数组退化为不过滤', () => {
    // Given 三个图层的过滤条件
    const filters = ['1=1', 'INTERSECTS(a)', '1=1']
    // When 拼多图层 CQL
    const cql = buildMultiLayerCql(filters)
    // Then 数量与图层数一致
    expect(cql).toBe('1=1;INTERSECTS(a);1=1')
    expect(cql.split(';').length).toBe(3)
    // 空条件退化为不过滤
    expect(buildMultiLayerCql([])).toBe('1=1')
  })

  it('条件合并：空条件与 1=1 被剔除，全空时退化为不过滤', () => {
    // Given 混有空串、undefined 与 1=1 的条件
    const cql = combineCql(undefined, '', '1=1', 'BBOX(geom)')
    // Then 只保留有效条件
    expect(cql).toBe('BBOX(geom)')
    // 全空时退化为不过滤
    expect(combineCql(undefined, '', '1=1')).toBe('1=1')
    expect(combineCql()).toBe('1=1')
  })
})