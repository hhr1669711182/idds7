/**
 * 地图样式统一出口。
 *
 * 原 `baseComponent/amap/featureStyle.ts` 已迁移至此并按职责拆分：
 * - `types`    纯类型定义（StyleKey / StyleParamsMap），controller protocol 可安全引用
 * - `icons`    图标资源 URL 统一入口
 * - `palette`  配色常量，主题相关色值走 `@/utils/themeColor`
 * - `factory`  样式构造器（createXxxStyle）
 * - `registry` 注册表 + 缓存 + getStyle 唯一出口
 *
 * 对外导出保持与原文件一致，调用方只需改 import 路径。
 */

// 类型
export type {
  IconAnchor,
  IconStyleOptions,
  StyleKey,
  StyleParamsMap,
  StyleBuilder,
  StyleBuilderMap,
  CachedStyle,
} from './types'

// 图标
export { MAP_ICON_SRC, CAR_ICON, FIRE_STATION_ICON, getCommonAlarmIconSrc } from './icons'

// 配色
export {
  ROUTE_LINE_STROKE,
  ROUTE_OUTLINE_COLOR,
  ROUTE_UNSELECTED_COLOR,
  SELECTED_ROUTE_OUTLINE_COLOR,
  BUFFER_POLYGON_FILL,
  MASK_FILL,
  MASK_STROKE,
  BOUNDARY_STROKE,
  BOUNDARY_STROKE_WIDTH,
  ENDPOINT_START_COLOR,
  ENDPOINT_END_COLOR,
  ENDPOINT_INNER_COLOR,
  TMC_STATUS_COLOR,
  VEHICLE_LABEL_TEXT_COLOR,
  VEHICLE_LABEL_BG_COLOR,
  VEHICLE_LABEL_FONT,
  FIRE_STATION_USAGE_TRACK_COLOR,
  FIRE_STATION_USAGE_TEXT_COLOR,
  FIRE_STATION_USAGE_CARD_BG,
  FIRE_STATION_USAGE_CARD_STROKE,
  getTmcStatusColor,
  getJRAlarmIconVariant,
  getFireStationUsageColor,
  getSelectedRouteInnerColor,
} from './palette'

// 工厂
export {
  createIconStyle,
  createBoundaryStyle,
  createMaskStyle,
  createRouteLineStyle,
  createTmcLineStyle,
  createSelectedTmcLineStyle,
  createRouteDirectionArrowStyle,
  createEndpointStyle,
  createVehicleStyle,
  createFireStationStyle,
  createJRAlarmStyle,
  VEHICLE_LABEL_LAYOUT,
} from './factory'

// 注册表
export { getStyle, clearStyleCache, getStyleCacheSize } from './registry'