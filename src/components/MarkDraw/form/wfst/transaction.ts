/**
 * WFS-T 事务封装：insert / update / delete / mixed
 * 直接走 geoserverApi.transaction(xml)，由 engine 捕获异常并回滚本地 feature。
 */
import { geoserverApi } from '@/apis/geoserver'
import { resolveFeatureType } from './nsResolver'
import { buildInsertXml, buildUpdateXml, buildDeleteXml, buildMixedXml, buildGeomUpdateXml } from './wfsXml'
import type Feature from 'ol/Feature'
import type { MarkDrawLayer } from '../../engine/types'

export interface TransactionResult {
  ok: boolean
  raw: unknown
  insertedIds?: Array<string | number>
}

/** 取事务响应的原始文本（alova 已把 JSON 解析掉，这里统一拿回文本） */
const rawTextOf = (raw: unknown): string => {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'string') return raw
  const r = raw as { data?: unknown }
  if (typeof r.data === 'string') return r.data
  try {
    return JSON.stringify(raw)
  } catch {
    return ''
  }
}

/**
 * GeoServer 的 WFS-T 失败时仍返回 HTTP 200 + ows:ExceptionReport XML，
 * alova 的通用 responded 钩子不会抛错，于是「失败」会被当成「成功」。
 * 这里显式识别异常报表并抛出，避免静默写失败。
 */
const assertTransactionOk = (raw: unknown): void => {
  const text = rawTextOf(raw)
  if (!text) return
  if (!text.includes('Exception') && !text.includes('exception')) return

  let message = 'GeoServer 拒绝了本次事务'
  try {
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    const nodes = Array.from(doc.getElementsByTagName('*')).filter((n) => /ExceptionText$/.test(n.localName))
    const detail = nodes
      .map((n) => n.textContent?.trim() ?? '')
      .filter(Boolean)
      .join('；')
    if (detail) message = detail
  } catch {
    /* 解析失败就用默认文案 */
  }
  // 服务端把图层设为只读时 GeoServer 的固定提示，转成人话
  if (/is read-only/i.test(message)) {
    throw new Error('服务端将该图层标记为只读，请检查 GeoServer 图层写权限或改用可写数据表。')
  }
  throw new Error(message)
}

/**
 * 从 WFS-T Insert 响应里取出服务端分配的主键。
 * alova 的 responded 已把响应读成 string（XML 解析失败会回落成原文），
 * 所以这里统一走 rawTextOf，不要再判断 raw.data / typeof raw === "object"，
 * 那些分支在当前响应形态下永远走不到，会让新增拿不到 id。
 */
const parseInsertedIds = (raw: unknown): Array<string | number> => {
  const text = rawTextOf(raw)
  if (!text.trim().startsWith('<')) return []
  try {
    const doc = new DOMParser().parseFromString(text, 'application/xml')
    const ids = Array.from(doc.getElementsByTagName('*')).filter((n) => /FeatureId$/.test(n.localName))
    return ids.map((n) => n.getAttribute('fid') ?? '').filter((s) => !!s)
  } catch {
    return []
  }
}

export const insertFeatures = async (layer: MarkDrawLayer, features: Feature[]): Promise<TransactionResult> => {
  const info = await resolveFeatureType(layer)
  const xml = buildInsertXml(layer, info, features)
  const raw = await geoserverApi.transaction(xml, layer.workspace)
  assertTransactionOk(raw)
  return { ok: true, raw, insertedIds: parseInsertedIds(raw) }
}

export const updateFeatures = async (layer: MarkDrawLayer, features: Feature[]): Promise<TransactionResult> => {
  const info = await resolveFeatureType(layer)
  // 几何专用路径：用 ogc:FeatureId 定位记录，只提交 zone_geom 一个字段。
  // 不把整个 properties 回写 —— 物理表的 create_time（dateTime）、is_deleted（boolean）
  // 等字段类型各不相同，全量回写会有丢类型、覆盖原值的风险。
  const geomXml = buildGeomUpdateXml(layer, info, features)
  const xml = geomXml ?? buildUpdateXml(layer, info, features)
  const raw = await geoserverApi.transaction(xml, layer.workspace)
  assertTransactionOk(raw)
  return { ok: true, raw }
}

export const deleteFeatures = async (layer: MarkDrawLayer, features: Feature[]): Promise<TransactionResult> => {
  const info = await resolveFeatureType(layer)
  const xml = buildDeleteXml(layer, info, features)
  const raw = await geoserverApi.transaction(xml, layer.workspace)
  assertTransactionOk(raw)
  return { ok: true, raw }
}

export const mixedTransaction = async (
  layer: MarkDrawLayer,
  inserts: Feature[],
  updates: Feature[],
  deletes: Feature[],
): Promise<TransactionResult> => {
  const info = await resolveFeatureType(layer)
  const xml = buildMixedXml(layer, info, inserts, updates, deletes)
  const raw = await geoserverApi.transaction(xml, layer.workspace)
  assertTransactionOk(raw)
  return { ok: true, raw, insertedIds: parseInsertedIds(raw) }
}
