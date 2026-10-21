import { MAP_ICON_SRC, FIRE_STATION_ICON, getCommonAlarmIconSrc } from './icons'
import {
  ROUTE_LINE_STROKE,
  SELECTED_ROUTE_OUTLINE_COLOR,
  BUFFER_POLYGON_FILL,
} from './palette'
import {
  createBoundaryStyle,
  createEndpointStyle,
  createFireStationStyle,
  createIconStyle,
  createJRAlarmStyle,
  createMaskStyle,
  createTmcLineStyle,
  createVehicleStyle,
} from './factory'
import type { CachedStyle, StyleBuilderMap, StyleKey, StyleParamsMap } from './types'

/**
 * 样式注册表：样式取用的唯一出口。
 *
 * 缓存策略按样式语义区分：
 * - 静态样式（图标、面、边界等）：按参数序列化结果缓存，返回共享实例，
 *   因为这些样式创建后不再被改写。
 * - vehicle：每次新建独立实例，不进缓存。原因是车辆朝向、倒计时、标签偏移
 *   每帧都在变，若返回共享单例，调用方改写会串到其他车辆上。
 */
const styleCache = new Map<string, CachedStyle>()

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
    return createIconStyle({ iconSrc: getCommonAlarmIconSrc(colorType, type) })
  },
  fireEngine: ({ iconSrc, ...args }) => createIconStyle({ iconSrc: iconSrc ?? MAP_ICON_SRC.fireEngine, ...args }),
}

/** 不共享实例的样式 key：其产物会被调用方按帧改写 */
const NON_CACHEABLE_KEYS: ReadonlySet<StyleKey> = new Set<StyleKey>(['vehicle'])

const getCacheKey = <K extends StyleKey>(key: K, params?: StyleParamsMap[K]): string =>
  params === undefined ? key : `${key}:${JSON.stringify(params)}`

/**
 * 按 key 取样式。
 *
 * @param key 样式键
 * @param params 样式参数；vehicle 的 rotation / countdownText / labelOffsetY 会被直接应用到新实例上
 */
export const getStyle = <K extends StyleKey>(key: K, params?: StyleParamsMap[K]): CachedStyle => {
  if (NON_CACHEABLE_KEYS.has(key)) {
    return STYLE_BUILDERS[key](params as never)
  }

  const cacheKey = getCacheKey(key, params)
  const cached = styleCache.get(cacheKey)
  if (cached) return cached

  const style = STYLE_BUILDERS[key](params as never)
  styleCache.set(cacheKey, style)
  return style
}

/** 清空静态样式缓存。主题切换或底图重载后按需调用，避免旧色值常驻。 */
export const clearStyleCache = (): void => {
  styleCache.clear()
}

/** 缓存条目数，供测试与调试观察缓存增长 */
export const getStyleCacheSize = (): number => styleCache.size

// 重新转出常量，保持对外单一入口（调用方只从本目录 import）
export { ROUTE_LINE_STROKE, SELECTED_ROUTE_OUTLINE_COLOR, BUFFER_POLYGON_FILL, MAP_ICON_SRC, FIRE_STATION_ICON }