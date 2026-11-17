/**
 * 地址机器人搜索要素的配色常量。
 *
 * 地图层的 OL 样式不认 CSS 变量，本文件是底座侧配色的**唯一真源**。
 * 颜色承载角色语义（红=锚定物 / 绿=查询结果 / 橙=锚定候选 / 蓝=搜索范围），**不随主题变化**。
 *
 * 取色分两组：
 * - **role 组**（ROLE_*）：按要素角色的默认配色，作为 source_table 判定不出时的兜底底色。
 * - **source_table 组**：按业务来源表（poi_1 / aoi_2 / aoi_3 …）与数据源（空间分析）取色，优先级高于 role 组。
 */

/** 地址机器人在地图上的要素角色 */
export type AddressRobotRole = 'anchor' | 'candidate' | 'anchor_candidate' | 'search_area'

/** role → 中文标签 */
export const ROLE_LABELS: Record<AddressRobotRole, string> = {
  anchor: '锚定物',
  candidate: '查询结果',
  anchor_candidate: '锚定候选',
  search_area: '搜索范围',
}

/** 面要素配色：填充 + 描边 */
export interface RolePolygonPalette {
  fill: string
  stroke: string
}

/** 线要素配色：颜色 + 线宽 */
export interface RoleLinePalette {
  color: string
  width: number
  dashed?: boolean
}

const roleFallback = {
  anchorFill: 'rgba(231, 76, 60, 0.28)',
  anchorStroke: '#e74c3c',
  candidateFill: 'rgba(39, 174, 96, 0.28)',
  candidateStroke: '#27ae60',
  anchorCandidateFill: 'rgba(243, 156, 18, 0.28)',
  anchorCandidateStroke: '#f39c12',
  searchAreaFill: 'rgba(33, 150, 243, 0.15)',
  searchAreaStroke: '#2196F3',
}

/** role → 面要素默认配色（source_table 判定不出时的兜底） */
export const ROLE_POLYGON_STYLES: Record<AddressRobotRole, RolePolygonPalette> = {
  anchor: { fill: roleFallback.anchorFill, stroke: roleFallback.anchorStroke },
  candidate: { fill: roleFallback.candidateFill, stroke: roleFallback.candidateStroke },
  anchor_candidate: { fill: roleFallback.anchorCandidateFill, stroke: roleFallback.anchorCandidateStroke },
  search_area: { fill: roleFallback.searchAreaFill, stroke: roleFallback.searchAreaStroke },
}

/** role → 线要素默认配色 */
export const ROLE_LINE_STYLES: Record<AddressRobotRole, RoleLinePalette> = {
  anchor: { color: roleFallback.anchorStroke, width: 5 },
  candidate: { color: roleFallback.candidateStroke, width: 4 },
  anchor_candidate: { color: roleFallback.anchorCandidateStroke, width: 4, dashed: true },
  search_area: { color: roleFallback.searchAreaStroke, width: 3, dashed: true },
}

/** 面要素取色结果。描边色同时用作文字色（现状如此），故 stroke 恒为实色。 */
export interface FeaturePalette {
  fill: string
  stroke: string
}

/**
 * 按业务来源表取面要素配色。
 *
 * 优先级：poi_1/poi_2 > aoi_2/aoi_3 > 空间分析数据源 > role 兜底。
 * @param sourceTable 要素的 source_table 属性
 * @param dataSource 要素的 data_source 属性
 * @param role 要素角色，用于最后兜底
 */
export const getFeaturePalette = (
  sourceTable: string | undefined,
  dataSource: string | undefined,
  role: AddressRobotRole | undefined,
  flash: boolean,
): FeaturePalette => {
  if (sourceTable === 'poi_1' || sourceTable === 'poi_2') {
    return flash
      ? { fill: 'rgba(231, 76, 60, 0.5)', stroke: '#0000ff' }
      : { fill: 'rgba(231, 76, 60, 0.8)', stroke: roleFallback.anchorStroke }
  }

  if (sourceTable === 'aoi_2' || sourceTable === 'aoi_3') {
    return {
      fill: flash ? 'rgba(231, 76, 60, 0.58)' : 'rgba(231, 76, 60, 0.28)',
      stroke: roleFallback.anchorStroke,
    }
  }

  if (dataSource === 'addressbot_spatial_analysis') {
    return {
      fill: flash ? SPATIAL_ANALYSIS_COLOR : SPATIAL_ANALYSIS_FILL_COLOR,
      stroke: 'rgba(211, 126, 90, 0)',
    }
  }

  const fallback = ROLE_POLYGON_STYLES[role ?? 'anchor'] ?? ROLE_POLYGON_STYLES.anchor
  return { fill: fallback.fill, stroke: fallback.stroke }
}

/** 点要素配色（按 role 区分） */
export interface PointPalette {
  /** 圆点填充色（实色） */
  fill: string
  /** 标签文字色 */
  text: string
  /** 圆点半径 */
  radius: number
}

/**
 * 点要素配色（按 role 区分）。
 * 颜色是角色语义色，不随主题变化。
 */
export const getPointPalette = (role: AddressRobotRole | undefined): PointPalette => {
  if (role === 'anchor') {
    return { fill: POINT_ROLE_COLORS.anchor.fill, text: POINT_ROLE_COLORS.anchor.text, radius: 10 }
  }
  if (role === 'candidate') {
    return { fill: POINT_ROLE_COLORS.candidate.fill, text: POINT_ROLE_COLORS.candidate.text, radius: 9 }
  }
  if (role === 'anchor_candidate') {
    return {
      fill: POINT_ROLE_COLORS.anchor_candidate.fill,
      text: POINT_ROLE_COLORS.anchor_candidate.text,
      radius: 7,
    }
  }
  return {
    fill: POINT_ROLE_COLORS.default.fill,
    text: POINT_ROLE_COLORS.default.text,
    radius: 6,
  }
}

/** 点要素角色配色表 */
export const POINT_ROLE_COLORS: Record<AddressRobotRole | 'default', { fill: string; text: string }> = {
  anchor: { fill: '#e74c3c', text: '#c0392b' },
  candidate: { fill: '#27ae60', text: '#1e8449' },
  anchor_candidate: { fill: '#f39c12', text: '#d68910' },
  search_area: { fill: '#95a5a6', text: '#95a5a6' },
  default: { fill: '#95a5a6', text: '#95a5a6' },
}

/** 描边与文字共用的白描边色 */
const WHITE_STROKE = '#ffffff'

/** 点要素描边色（统一白描边，与现状一致） */
export const POINT_STROKE_COLOR = WHITE_STROKE

/** 点要素文字描边色（白描边，保证底图上可读） */
export const POINT_TEXT_STROKE_COLOR = WHITE_STROKE

/** 闪烁态点要素的强调色 */
export const FLASH_POINT_COLOR = '#0000ff'

/**
 * 空间分析结果的强调色（闪烁态）。
 * 目前仅本文件内部取色使用，暂无外部消费方，先保留导出待后续接入。
 */
export const SPATIAL_ANALYSIS_COLOR = 'rgba(227, 230, 90, 0.58)'

/** 空间分析结果的常态填充色 */
const SPATIAL_ANALYSIS_FILL_COLOR = 'rgba(227, 230, 90, 0.28)'
