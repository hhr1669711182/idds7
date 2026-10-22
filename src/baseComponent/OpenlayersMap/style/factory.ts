import { Fill, Icon, Stroke, Style, Text } from 'ol/style'
import routeDirectionArrow from '@/assets/ui/buttons/right.png'
import { MAP_ICON_SRC, getCommonAlarmIconSrc } from './icons'
import {
  BOUNDARY_STROKE,
  BOUNDARY_STROKE_WIDTH,
  ENDPOINT_END_COLOR,
  ENDPOINT_INNER_COLOR,
  ENDPOINT_START_COLOR,
  FIRE_STATION_USAGE_CARD_BG,
  FIRE_STATION_USAGE_CARD_STROKE,
  FIRE_STATION_USAGE_TEXT_COLOR,
  FIRE_STATION_USAGE_TRACK_COLOR,
  MASK_FILL,
  MASK_STROKE,
  ROUTE_OUTLINE_COLOR,
  SELECTED_ROUTE_OUTER_COLOR,
  VEHICLE_LABEL_BG_COLOR,
  VEHICLE_LABEL_FONT,
  VEHICLE_LABEL_TEXT_COLOR,
  getFireStationUsageColor,
  getJRAlarmIconVariant,
  getSelectedRouteInnerColor,
  getTmcStatusColor,
} from './palette'
import type { CachedStyle, IconAnchor, IconStyleOptions, StyleParamsMap } from './types'
import type { AmapTmcStatus } from '@/baseComponent/amap/useAmapTools'

const DEFAULT_ICON_ANCHOR: IconAnchor = [0.5, 1]
const CENTER_ICON_ANCHOR: IconAnchor = [0.5, 0.5]

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

/** 基础图标样式构造器：全模块的图标样式都从这里出 */
export const createIconStyle = ({
  iconSrc,
  scale = 0.9,
  anchor = DEFAULT_ICON_ANCHOR,
  rotation = 0,
  rotateWithView,
  maxZIndex = 10000,
  ...rest
}: IconStyleOptions) =>
  new Style({
    zIndex: maxZIndex,
    image: new Icon({
      src: iconSrc,
      anchor,
      scale,
      rotation,
      rotateWithView,
      ...rest,
    }),
  })

export const createBoundaryStyle = () =>
  new Style({
    stroke: new Stroke({ color: BOUNDARY_STROKE, width: BOUNDARY_STROKE_WIDTH }),
  })

export const createMaskStyle = () =>
  new Style({
    fill: new Fill({ color: MASK_FILL }),
    stroke: new Stroke({ color: MASK_STROKE, width: 0 }),
  })

/**
 * 路线采用白色外描边 + 彩色内线。外描边会先绘制，保证路线在卫星图、
 * 深色底图和复杂道路标注上都保持清晰，效果与导航路线一致。
 */
export const createRouteLineStyle = (color: string, width = 6): Style[] => [
  new Style({
    zIndex: 0,
    stroke: new Stroke({
      color: ROUTE_OUTLINE_COLOR,
      width: width + 4,
      lineCap: 'round',
      lineJoin: 'round',
    }),
  }),
  new Style({
    zIndex: 1,
    stroke: new Stroke({
      color,
      width,
      lineCap: 'round',
      lineJoin: 'round',
    }),
  }),
]

export const createTmcLineStyle = (status: AmapTmcStatus, width = 6) =>
  createRouteLineStyle(getTmcStatusColor(status), width)

/** 高亮外线与路况内线共用同一几何，避免蓝线露出为填充。 */
const createSelectedRouteOutlineStyle = (width = 6): Style[] => [
  new Style({
    zIndex: 100,
    stroke: new Stroke({
      color: SELECTED_ROUTE_OUTER_COLOR,
      width: width + 10,
      lineCap: 'round',
      lineJoin: 'round',
    }),
  }),
  new Style({
    zIndex: 101,
    stroke: new Stroke({
      color: getSelectedRouteInnerColor(),
      width: width + 4,
      lineCap: 'round',
      lineJoin: 'round',
    }),
  }),
]

/** 先绘制荧光蓝外描边，再用原路况内线覆盖中心，仅保留两侧蓝边。 */
export const createSelectedTmcLineStyle = (status: AmapTmcStatus, width = 6): Style[] => [
  ...createSelectedRouteOutlineStyle(width),
  new Style({
    zIndex: 102,
    stroke: new Stroke({
      color: getTmcStatusColor(status),
      width,
      lineCap: 'round',
      lineJoin: 'round',
    }),
  }),
]

/** 路线前进方向箭头样式。旋转值由整条路线的等距采样结果提供。 */
export const createRouteDirectionArrowStyle = (rotation: number) =>
  new Style({
    zIndex: 20,
    image: new Icon({
      // 素材朝右，高度对应路线横向宽度，不超出 6px 路线。
      src: routeDirectionArrow,
      height: 6,
      anchor: CENTER_ICON_ANCHOR,
      rotation: rotation - Math.PI / 2,
      rotateWithView: true,
    }),
  })

const createPointSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="10" fill="${color}"/><circle cx="14" cy="14" r="6" fill="${ENDPOINT_INNER_COLOR}"/></svg>`

export const createEndpointStyle = (type: 'start' | 'end' | 'alarm') => {
  if (type === 'alarm') {
    return createIconStyle({ iconSrc: MAP_ICON_SRC.alarm })
  }

  return createIconStyle({
    iconSrc: svgDataUrl(createPointSvg(type === 'start' ? ENDPOINT_START_COLOR : ENDPOINT_END_COLOR)),
    anchor: CENTER_ICON_ANCHOR,
    scale: 1,
  })
}

// 车辆标签布局参数，供渲染和点击检测共用
export const VEHICLE_LABEL_LAYOUT = {
  offsetY: -46,
  fontSize: 12,
  lineHeight: 16,
  paddingTop: 5,
  paddingRight: 8,
  paddingBottom: 5,
  paddingLeft: 8,
} as const

/**
 * 车辆样式：每次调用都新建独立实例。
 *
 * 历史上该样式走缓存并返回共享单例，调用方再 setRotation / setText / setZIndex，
 * 导致同 styleId 下多车互相覆盖朝向、倒计时与层级。此处按实例隔离，
 * 由 registry 负责不再缓存 vehicle。
 */
export const createVehicleStyle = ({
  src,
  rotation,
  scale = 0.65,
  countdownText = '',
  labelOffsetY = VEHICLE_LABEL_LAYOUT.offsetY,
  zIndex = 200,
}: StyleParamsMap['vehicle']): CachedStyle =>
  new Style({
    zIndex,
    image: new Icon({
      src,
      rotation,
      rotateWithView: true,
      scale,
      anchor: CENTER_ICON_ANCHOR,
    }),
    text: new Text({
      text: countdownText,
      // 展开详情时允许把标签动态上移
      offsetY: labelOffsetY,
      font: VEHICLE_LABEL_FONT,
      textAlign: 'center',
      justify: 'left',
      fill: new Fill({ color: VEHICLE_LABEL_TEXT_COLOR }),
      backgroundFill: new Fill({ color: VEHICLE_LABEL_BG_COLOR }),
      padding: [
        VEHICLE_LABEL_LAYOUT.paddingTop,
        VEHICLE_LABEL_LAYOUT.paddingRight,
        VEHICLE_LABEL_LAYOUT.paddingBottom,
        VEHICLE_LABEL_LAYOUT.paddingLeft,
      ],
      textBaseline: 'bottom',
    }),
  })

const createFireStationUsageSvg = ({
  deviceGoouts = 0,
  deviceTotal = 0,
}: {
  deviceGoouts?: number
  deviceTotal?: number
}) => {
  const total = Math.max(0, Math.trunc(Number(deviceTotal) || 0))
  const goouts = Math.min(total, Math.max(0, Math.trunc(Number(deviceGoouts) || 0)))
  const ratio = total > 0 ? Math.min(1, Math.max(0, goouts / total)) : 0
  const percent = Math.round(ratio * 100)
  const color = getFireStationUsageColor(percent)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="98" height="28" viewBox="0 0 98 28">
    <rect x="1" y="1" width="96" height="26" rx="6" fill="${FIRE_STATION_USAGE_CARD_BG}" stroke="${FIRE_STATION_USAGE_CARD_STROKE}"/>
    <text x="8" y="14" font-size="11" font-family="Arial, sans-serif" font-weight="700" fill="${FIRE_STATION_USAGE_TEXT_COLOR}">${goouts}/${total}</text>
    <text x="90" y="14" text-anchor="end" font-size="11" font-family="Arial, sans-serif" font-weight="700" fill="${color}">${percent}%</text>
    <rect x="8" y="19" width="82" height="4" rx="2" fill="${FIRE_STATION_USAGE_TRACK_COLOR}"/>
    <rect x="8" y="19" width="${Math.round(82 * ratio)}" height="4" rx="2" fill="${color}"/>
  </svg>`
}

export const createFireStationStyle = ({
  iconSrc,
  scale = 0.8,
  deviceGoouts,
  deviceTotal,
}: StyleParamsMap['fireStation']): CachedStyle => {
  const iconStyle = createIconStyle({ iconSrc, scale })

  if (deviceGoouts === undefined && deviceTotal === undefined) {
    return iconStyle
  }

  return [
    iconStyle,
    createIconStyle({
      iconSrc: svgDataUrl(createFireStationUsageSvg({ deviceGoouts, deviceTotal })),
      anchor: [0.5, 2.05],
      scale: 1,
    }),
  ]
}

export const createJRAlarmStyle = ({ status, scale = 0.9 }: StyleParamsMap['jrAlarm']) =>
  createIconStyle({
    iconSrc: MAP_ICON_SRC[getJRAlarmIconVariant(status)],
    scale,
  })

/** 通用警情样式图标源（供 registry 注册表使用） */
export const createCommonAlarmIconSrc = (colorType: string, type: string) => getCommonAlarmIconSrc(colorType, type)
