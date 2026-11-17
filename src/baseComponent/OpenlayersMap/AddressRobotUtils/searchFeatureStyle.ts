import { Style, Circle, Fill, Stroke, Text } from 'ol/style'
import type { FeatureLike } from 'ol/Feature'
import type { StyleFunction } from 'ol/style/Style'
import { getStyle, type CachedStyle } from '@/baseComponent/OpenlayersMap/style'
import {
  FLASH_POINT_COLOR,
  getFeaturePalette,
  getPointPalette,
  POINT_ROLE_COLORS,
  POINT_STROKE_COLOR,
  POINT_TEXT_STROKE_COLOR,
  ROLE_LABELS,
  ROLE_LINE_STYLES,
  ROLE_POLYGON_STYLES,
  type AddressRobotRole,
  type RoleLinePalette,
} from './addressRobotPalette'

// 三个 role 表在本文件内只有 ROLE_LINE_STYLES 被实际消费；ROLE_LABELS / ROLE_POLYGON_STYLES
// 目前仅作对外导出（ROLE_POLYGON_STYLES 在 addressRobotPalette 内作 getFeaturePalette 兜底），
// 全仓暂无其他消费方，先保留导出待后续接入。
export { ROLE_LABELS, ROLE_POLYGON_STYLES, ROLE_LINE_STYLES }

/** getStyle 可能返回样式数组，告警样式只取第一个（数组首元素即主图标样式）。 */
const resolveSingleStyle = (style: CachedStyle): Style => (Array.isArray(style) ? style[0] : style)

/** 取要素的通用名称标签（按优先级回退） */
function labelText(feature: FeatureLike): string {
  return (
    String(
      feature.get('matched_name') || feature.get('building_name') || feature.get('poi_name') || feature.get('name') || '',
    )
  )
}

/** 按 source_table 取要素的业务名称，命中不到返回空串（与 labelText 的通用回退不同） */
function getSourceTableLabel(feature: FeatureLike): string {
  const source_table = feature.get('source_table')
  if (source_table == 'poi_1' || source_table == 'poi_2') {
    return String(feature.get('building_name') ?? '')
  }
  if (source_table == 'poi_3') {
    return String(feature.get('poi_name') ?? '')
  }
  if (source_table == 'aoi_2' || source_table == 'aoi_3') {
    return String(feature.get('aoi_name') ?? '')
  }
  if (source_table == 'loi_road') {
    return String(feature.get('cn_name') ?? '')
  }
  return ''
}

function isPolygonGeometry(geomType: string | undefined): boolean {
  return geomType === 'Polygon' || geomType === 'MultiPolygon'
}

function isLineGeometry(geomType: string | undefined): boolean {
  return geomType === 'LineString' || geomType === 'MultiLineString'
}

/** 取面要素配色：按 source_table / data_source 判定优先，判定不出时回落到 role 默认色 */
function getPalette(feature: FeatureLike, flash = false) {
  const source_table = feature.get('source_table')
  const data_source = feature.get('data_source')
  const role = feature.get('role') as AddressRobotRole | undefined
  return getFeaturePalette(
    source_table == null ? undefined : String(source_table),
    data_source == null ? undefined : String(data_source),
    role,
    flash,
  )
}

function polygonStyle(feature: FeatureLike, dashed = false): Style {
  const palette = getPalette(feature)
  return new Style({
    fill: new Fill({ color: palette.fill }),
    stroke: new Stroke({
      color: palette.stroke,
      width: 2,
      lineDash: dashed ? [6, 4] : undefined,
    }),
    text: new Text({
      text: getSourceTableLabel(feature),
      font: '20px sans-serif',
      fill: new Fill({ color: palette.stroke }),
      stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
      overflow: true,
    }),
  })
}

function polygonStyleFlash(feature: FeatureLike, dashed = false, flash = false): Style {
  const palette = getPalette(feature, flash)
  return new Style({
    fill: new Fill({ color: palette.fill }),
    stroke: new Stroke({
      color: palette.stroke,
      width: 2,
      lineDash: dashed ? [6, 4] : undefined,
    }),
    text: new Text({
      text: getSourceTableLabel(feature),
      font: '20px sans-serif',
      fill: new Fill({ color: palette.stroke }),
      stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
      overflow: true,
    }),
  })
}

function lineStyleFlash(feature: FeatureLike, flash = false): Style {
  const palette: RoleLinePalette = flash
    ? { color: ROLE_LINE_STYLES.candidate.color, width: 5 }
    : { color: ROLE_LINE_STYLES.anchor.color, width: 5 }
  return new Style({
    stroke: new Stroke({
      color: palette.color,
      width: palette.width,
      lineCap: 'round',
      lineJoin: 'round',
      lineDash: palette.dashed ? [10, 6] : undefined,
    }),
    text: new Text({
      text: getSourceTableLabel(feature),
      font: '16px sans-serif',
      fill: new Fill({ color: palette.color }),
      stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
      overflow: true,
    }),
  })
}

function lineStyle(feature: FeatureLike): Style {
  const palette = ROLE_LINE_STYLES.anchor
  return new Style({
    stroke: new Stroke({
      color: palette.color,
      width: palette.width,
      lineCap: 'round',
      lineJoin: 'round',
      lineDash: palette.dashed ? [10, 6] : undefined,
    }),
    text: new Text({
      text: getSourceTableLabel(feature),
      font: '16px sans-serif',
      fill: new Fill({ color: palette.color }),
      stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
      overflow: true,
    }),
  })
}

export function createSearchStyleFunction(): StyleFunction {
  return (feature) => {
    const role = feature.get('role') as AddressRobotRole | undefined
    const geomType = feature.getGeometry()?.getType()

    if (isLineGeometry(geomType)) {
      return lineStyle(feature)
    }

    if (isPolygonGeometry(geomType)) {
      return polygonStyle(feature, role === 'search_area' || role === 'anchor_candidate')
    }

    if (role === 'anchor') {
      const palette = getPointPalette(role)
      return new Style({
        image: new Circle({
          radius: palette.radius,
          fill: new Fill({ color: palette.fill }),
          stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
        }),
        text: new Text({
          text: labelText(feature),
          offsetY: -22,
          font: 'bold 13px sans-serif',
          fill: new Fill({ color: palette.text }),
          stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
        }),
      })
    }

    if (role === 'candidate') {
      const palette = getPointPalette(role)
      return new Style({
        image: new Circle({
          radius: palette.radius,
          fill: new Fill({ color: palette.fill }),
          stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
        }),
        text: new Text({
          text: labelText(feature),
          offsetY: -20,
          font: 'bold 12px sans-serif',
          fill: new Fill({ color: palette.text }),
          stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
        }),
      })
    }

    if (role === 'anchor_candidate') {
      const palette = getPointPalette(role)
      return new Style({
        image: new Circle({
          radius: palette.radius,
          fill: new Fill({ color: palette.fill }),
          stroke: new Stroke({ color: POINT_STROKE_COLOR, width: 2, lineDash: [4, 2] }),
        }),
        text: new Text({
          text: labelText(feature),
          offsetY: -16,
          font: '12px sans-serif',
          fill: new Fill({ color: palette.text }),
          stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
        }),
      })
    }

    return new Style({
      image: new Circle({
        radius: 6,
        fill: new Fill({ color: POINT_ROLE_COLORS.default.fill }),
        stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 2 }),
      }),
    })
  }
}

export function createDisplayStyleFunction(): StyleFunction {
  return (feature) => {
    const source_table = feature.get('source_table')
    const geomType = feature.getGeometry()?.getType()

    if (feature.get('alarm') === 'alarm') {
      const baseStyle = resolveSingleStyle(getStyle('alarm'))
      const poi_name = feature.get('poi_name')
      return new Style({
        image: baseStyle.getImage() ?? undefined,
        text: poi_name
          ? new Text({
              text: poi_name,
              offsetY: -22,
              font: 'bold 12px sans-serif',
              fill: new Fill({ color: POINT_ROLE_COLORS.anchor.text }),
              stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 2 }),
            })
          : undefined,
        zIndex: baseStyle.getZIndex(),
      })
    }

    if (isLineGeometry(geomType)) {
      return lineStyle(feature)
    }

    if (isPolygonGeometry(geomType)) {
      return polygonStyle(feature)
    }

    if (source_table === 'poi_3') {
      return new Style({
        image: new Circle({
          radius: 10,
          fill: new Fill({ color: POINT_ROLE_COLORS.anchor.fill }),
          stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
        }),
        text: new Text({
          text: getSourceTableLabel(feature),
          offsetY: -22,
          font: 'bold 20px sans-serif',
          fill: new Fill({ color: POINT_ROLE_COLORS.anchor.text }),
          stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
        }),
      })
    }
    return new Style({
      image: new Circle({
        radius: 6,
        fill: new Fill({ color: POINT_ROLE_COLORS.default.fill }),
        stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 2 }),
      }),
    })
  }
}

/**
 * 生成单个要素的闪烁态样式。
 * @param feature 目标要素
 * @param flash true 表示高亮闪烁态；false 表示常态（线要素此时走 anchor 色而非 candidate 色）
 */
export function createFlashStyleFunction(feature: FeatureLike, flash: boolean): Style {
  const source_table = feature.get('source_table')
  const geomType = feature.getGeometry()?.getType()

  // 检查 alarm 属性，二次包装添加文本标签（闪烁时也保持）
  if (feature.get('alarm') === 'alarm') {
    const baseStyle = resolveSingleStyle(getStyle('alarm'))
    const poi_name = feature.get('poi_name')
    return new Style({
      image: baseStyle.getImage() ?? undefined,
      text: poi_name
        ? new Text({
            text: poi_name,
            offsetY: -22,
            font: 'bold 12px sans-serif',
            fill: new Fill({ color: POINT_ROLE_COLORS.anchor.text }),
            stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 2 }),
          })
        : undefined,
      zIndex: baseStyle.getZIndex(),
    })
  }

  if (isLineGeometry(geomType)) {
    return lineStyleFlash(feature, flash)
  }

  if (isPolygonGeometry(geomType)) {
    return polygonStyleFlash(feature, false, flash)
  }

  if (source_table === 'poi_3') {
    return new Style({
      image: new Circle({
        radius: 10,
        fill: new Fill({ color: flash ? FLASH_POINT_COLOR : POINT_ROLE_COLORS.anchor.fill }),
        stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
      }),
      text: new Text({
        text: getSourceTableLabel(feature),
        offsetY: -22,
        font: 'bold 20px sans-serif',
        fill: new Fill({ color: flash ? FLASH_POINT_COLOR : POINT_ROLE_COLORS.anchor.text }),
        stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 3 }),
      }),
    })
  }
  return new Style({
    image: new Circle({
      radius: 6,
      fill: new Fill({ color: POINT_ROLE_COLORS.default.fill }),
      stroke: new Stroke({ color: POINT_TEXT_STROKE_COLOR, width: 2 }),
    }),
  })
}
