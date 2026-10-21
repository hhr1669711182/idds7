import type { JRAlarmStatus } from '@/baseComponent/amap/mapData'
import type { AmapTmcStatus } from '@/baseComponent/amap/useAmapTools'

/** 图标锚点，OL 语义：[x, y] */
export type IconAnchor = [number, number]

/** 缓存可持有的样式产物：OL 样式或其数组组合 */
export type CachedStyle = import('ol/style').Style | import('ol/style').Style[]

export type IconStyleOptions = {
  iconSrc: string
  scale?: number
  anchor?: IconAnchor
  rotation?: number
  rotateWithView?: boolean
  /** 图标层级，数值越大越靠上 */
  maxZIndex?: number
  [key: string]: unknown
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

export type StyleParamsMap = {
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
    /** 同一车辆跨帧复用的缓存标识 */
    styleId?: string
    /** 车辆标签纵向偏移 */
    labelOffsetY?: number
    /** 样式层级，由工厂内部设置，避免调用方改写共享实例 */
    zIndex?: number
  }
  commonAlarm: {
    type: 'fire' | 'rescue' | 'society'
    colorType: 'blue' | 'red' | 'grey' | 'def'
    iconSrc?: string
    scale?: number
  }
  fireEngine: IconStyleOptions
}

export type StyleBuilder<K extends StyleKey> = (params: StyleParamsMap[K]) => CachedStyle
export type StyleBuilderMap = { [K in StyleKey]: StyleBuilder<K> }