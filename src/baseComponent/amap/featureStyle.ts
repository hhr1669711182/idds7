import { Fill, Icon, Stroke, Style, Text } from 'ol/style'
import { asArray } from 'ol/color'
import type { JRAlarmStatus } from './mapData'
import type { AmapTmcStatus } from './useAmapTools'
import { point } from '@turf/turf'
import routeDirectionArrow from '../../assets/right.png'

export const MAP_ICON_SRC = {
  alarm: new URL('./imgs/alarm.png', import.meta.url).toString(),
  jrAlarmActive: new URL('./imgs/即时警情.png', import.meta.url).toString(),
  jrAlarmGray: new URL('./imgs/即时警情-灰.png', import.meta.url).toString(),
  fireEngine: new URL('./imgs/fire-engine.svg', import.meta.url).toString(),
  car: new URL('./imgs/car.png', import.meta.url).toString(),
  point: new URL('./imgs/poi.png', import.meta.url).toString(),
  endPoint: new URL('./imgs/shui.png', import.meta.url).toString(),
  primaryStation: new URL('./imgs/zhu.png', import.meta.url).toString(),
} as const // 默认配置

/** mock / 在线车辆图标（GC-03） */
export const CAR_ICON = MAP_ICON_SRC.car

type IconAnchor = [number, number]
type CachedStyle = Style | Style[]

export type IconStyleOptions = {
  iconSrc: string
  scale?: number
  anchor?: IconAnchor
  rotation?: number
  rotateWithView?: boolean
  [key: string]: any
}

export type StyleKey =
  | 'alarm'
  | 'boundary'
  | 'endpoint'
  | 'point'
  | 'fireStation'
  | 'icon'
  | 'jrAlarm'
  | 'mask'
  | 'tmcLine'
  | 'vehicle'
  | 'commonAlarm'
  | 'fireEngine'

type StyleParamsMap = {
  alarm: Pick<IconStyleOptions, 'iconSrc' | 'scale'>
  boundary: undefined
  point: undefined
  endpoint: { type: 'start' | 'end' | 'alarm' }
  fireStation: {
    iconSrc: string
    scale?: number
    deviceGoouts?: number
    deviceTotal?: number
  }
  icon: IconStyleOptions
  jrAlarm: { status: JRAlarmStatus; scale?: number }
  mask: undefined
  tmcLine: { status: AmapTmcStatus; width?: number }
  vehicle: {
    src: string
    rotation: number
    scale?: number
    countdownText?: string
    styleId?: string

    // 新增：车辆标签纵向偏移
    labelOffsetY?: number
  }
  commonAlarm: {
    type: 'fire' | 'rescue' | 'society'
    colorType: 'blue' | 'red' | 'grey' | 'def'
    iconSrc?: string
    scale?: number
  }
  fireEngine: any
}

type StyleBuilder<K extends StyleKey> = (params: StyleParamsMap[K]) => CachedStyle
type StyleBuilderMap = { [K in StyleKey]: StyleBuilder<K> }

const DEFAULT_ICON_ANCHOR: IconAnchor = [0.5, 1]
const CENTER_ICON_ANCHOR: IconAnchor = [0.5, 0.5]

const JR_ALARM_ICON_BY_STATUS: Record<JRAlarmStatus, string> = {
  接警: MAP_ICON_SRC.jrAlarmActive,
  调派: MAP_ICON_SRC.jrAlarmActive,
  途中: MAP_ICON_SRC.jrAlarmActive,
  处置: MAP_ICON_SRC.jrAlarmActive,
  归队: MAP_ICON_SRC.jrAlarmGray,
}

export const BUFFER_POLYGON_FILL = 'rgba(255, 165, 0, 0.3)'
export const ROUTE_LINE_STROKE = '#409eff'
export const FIRE_STATION_ICON = new URL('./imgs/xfz.png', import.meta.url).toString()

const TMC_STATUS_COLOR: Record<AmapTmcStatus, string> = {
  unknown: '#9CA3AF',
  smooth: '#22C55E',
  slow: '#F59E0B',
  jam: '#EF4444',
  serious_jam: '#7F1D1D',
}

const styleCache = new Map<string, CachedStyle>()

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

const createIconStyle = ({
  iconSrc,
  scale = 0.9,
  anchor = DEFAULT_ICON_ANCHOR,
  rotation = 0,
  rotateWithView,
  maxZIndex = 10000,
  ...arg
}: IconStyleOptions) =>
  new Style({
    zIndex: maxZIndex,
    image: new Icon({
      src: iconSrc,
      anchor,
      scale,
      rotation,
      rotateWithView,
      ...arg,
    }),
  })

const createPointSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="10" fill="${color}"/><circle cx="14" cy="14" r="6" fill="white"/></svg>`

export const createBoundaryStyle = () =>
  new Style({
    stroke: new Stroke({ color: '#2563EB', width: 3 }),
  })

export const createMaskStyle = () =>
  new Style({
    fill: new Fill({ color: 'rgba(0,0,0,0.12)' }),
    stroke: new Stroke({ color: 'rgba(0,0,0,0)', width: 0 }),
  })

/**
 * 路线采用白色外描边 + 彩色内线。外描边会先绘制，保证路线在卫星图、
 * 深色底图和复杂道路标注上都保持清晰，效果与导航路线一致。
 */
export const createRouteLineStyle = (color: string, width = 6): Style[] => [
  new Style({
    zIndex: 0,
    stroke: new Stroke({
      color: 'rgba(255, 255, 255, 0.96)',
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
  createRouteLineStyle(TMC_STATUS_COLOR[status] ?? TMC_STATUS_COLOR.unknown, width)

export const SELECTED_ROUTE_OUTLINE_COLOR = '#00f0ff'

/** 高亮外线与路况内线共用同一几何，避免蓝线露出为填充。 */
const createSelectedRouteOutlineStyle = (width = 6): Style[] => [
  new Style({
    zIndex: 100,
    stroke: new Stroke({
      color: 'rgba(0, 240, 255, 0.28)',
      width: width + 10,
      lineCap: 'round',
      lineJoin: 'round',
    }),
  }),
  new Style({
    zIndex: 101,
    stroke: new Stroke({
      color: [...asArray(SELECTED_ROUTE_OUTLINE_COLOR).slice(0, 3), 0.7],
      width: width + 4,
      lineCap: 'round',
      lineJoin: 'round',
    }),
  }),
]

/** 先绘制荧光蓝外描边，再用原路况内线覆盖中心，仅保留两侧蓝边。 */
export const createSelectedTmcLineStyle = (status: AmapTmcStatus, width = 6): Style[] => {
  const routeColor = TMC_STATUS_COLOR[status] ?? TMC_STATUS_COLOR.unknown
  return [
    ...createSelectedRouteOutlineStyle(width),
    new Style({
      zIndex: 102,
      stroke: new Stroke({
        color: routeColor,
        width,
        lineCap: 'round',
        lineJoin: 'round',
      }),
    }),
  ]
}

/** 路线前进方向箭头样式。旋转值由整条路线的等距采样结果提供。 */
export const createRouteDirectionArrowStyle = (rotation: number) =>
  new Style({
    zIndex: 20,
    image: new Icon({
      // 素材朝右，高度对应路线横向宽度，不超出 6px 路线。
      src: routeDirectionArrow,
      height: 6,
      anchor: [0.5, 0.5],
      rotation: rotation - Math.PI / 2,
      rotateWithView: true,
    }),
  })

export const createEndpointStyle = (type: 'start' | 'end' | 'alarm') => {
  if (type === 'alarm') {
    return createIconStyle({ iconSrc: MAP_ICON_SRC.alarm })
  }

  return createIconStyle({
    iconSrc: svgDataUrl(createPointSvg(type === 'start' ? '#22C55E' : '#EF4444')),
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

export const createVehicleStyle = ({
  src,
  rotation,
  scale = 0.65,
  countdownText = '',
  labelOffsetY = VEHICLE_LABEL_LAYOUT.offsetY,
}: {
  src: string
  rotation: number
  scale?: number
  countdownText?: string
  labelOffsetY?: number
}) =>
  new Style({
    zIndex: 200,

    image: new Icon({
      src,
      rotation,
      rotateWithView: true,
      scale,
      anchor: CENTER_ICON_ANCHOR,
    }),

    text: new Text({
      text: countdownText,

      // 修改这里：
      // 原来固定 VEHICLE_LABEL_LAYOUT.offsetY
      // 现在允许展开详情时动态上移
      offsetY: labelOffsetY,

      font: '700 12px sans-serif',
      textAlign: 'center',
      justify: 'left',

      fill: new Fill({
        color: '#FFFFFF',
      }),

      backgroundFill: new Fill({
        color: 'rgba(17, 24, 39, 0.86)',
      }),

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
  const color = percent >= 70 ? '#EF4444' : percent >= 35 ? '#F59E0B' : '#22C55E'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="98" height="28" viewBox="0 0 98 28">
    <rect x="1" y="1" width="96" height="26" rx="6" fill="rgba(15,23,42,0.88)" stroke="rgba(255,255,255,0.7)"/>
    <text x="8" y="14" font-size="11" font-family="Arial, sans-serif" font-weight="700" fill="#fff">${goouts}/${total}</text>
    <text x="90" y="14" text-anchor="end" font-size="11" font-family="Arial, sans-serif" font-weight="700" fill="${color}">${percent}%</text>
    <rect x="8" y="19" width="82" height="4" rx="2" fill="rgba(148,163,184,0.36)"/>
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
    iconSrc: JR_ALARM_ICON_BY_STATUS[status],
    scale,
  })

const STYLE_BUILDERS: StyleBuilderMap = {
  alarm: (params = { iconSrc: MAP_ICON_SRC.alarm, scale: 0.9 }) => createIconStyle(params),
  boundary: () => createBoundaryStyle(),
  point: () => createIconStyle({ iconSrc: MAP_ICON_SRC.point, scale: 1.2 }),
  endpoint: (params) => createEndpointStyle(params.type),
  fireStation: (params) => createFireStationStyle(params),
  icon: (params) => createIconStyle(params),
  jrAlarm: (params) => createJRAlarmStyle(params),
  mask: () => createMaskStyle(),
  tmcLine: (params) => createTmcLineStyle(params.status, params.width ?? 6),
  vehicle: (params) => createVehicleStyle(params),
  commonAlarm: (params) => {
    const { type, colorType = 'def' } = params
    let url = `${colorType}-${type}`
    const iconSrc = new URL(`./imgs/${url}.svg`, import.meta.url).toString()

    return createIconStyle({ iconSrc })
  },
  fireEngine: ({ iconSrc, ...args }) => createIconStyle({ iconSrc: iconSrc ?? MAP_ICON_SRC.fireEngine, ...args }),
}

const getVehicleCacheKey = (params: StyleParamsMap['vehicle']) =>
  ['vehicle', params.src, params.scale ?? 0.65, params.styleId ?? 'default'].join(':')

const getCacheKey = <K extends StyleKey>(key: K, params?: StyleParamsMap[K]) => {
  if (key === 'vehicle') {
    return getVehicleCacheKey(params as StyleParamsMap['vehicle'])
  }

  return params === undefined ? key : `${key}:${JSON.stringify(params)}`
}

const createCachedStyle = <K extends StyleKey>(key: K, params: StyleParamsMap[K]) =>
  STYLE_BUILDERS[key](params as never)

export const getStyle = <K extends StyleKey>(key: K, params?: StyleParamsMap[K]) => {
  const cacheKey = getCacheKey(key, params)

  if (key === 'vehicle') {
    const vehicleParams = params as StyleParamsMap['vehicle']

    const style =
      (styleCache.get(cacheKey) as Style | undefined) ??
      createVehicleStyle({
        src: vehicleParams.src,
        rotation: 0,
        scale: vehicleParams.scale,
        countdownText: vehicleParams.countdownText,

        // 新增
        labelOffsetY: vehicleParams.labelOffsetY ?? VEHICLE_LABEL_LAYOUT.offsetY,
      })

    styleCache.set(cacheKey, style)

    // 保持原来的车辆旋转逻辑
    ;(style.getImage() as Icon).setRotation(vehicleParams.rotation)

    // 保持原来的文字动态刷新
    style.getText()?.setText(vehicleParams.countdownText ?? '')

    // 新增：
    // 展开/收起时同步更新标签实际绘制位置
    style.getText()?.setOffsetY(vehicleParams.labelOffsetY ?? VEHICLE_LABEL_LAYOUT.offsetY)

    return style
  }

  const cached = styleCache.get(cacheKey)
  if (cached) return cached

  const style = createCachedStyle(key, params as StyleParamsMap[K])
  styleCache.set(cacheKey, style)
  return style
}
