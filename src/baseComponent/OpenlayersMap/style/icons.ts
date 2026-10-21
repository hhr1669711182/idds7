/**
 * 地图图标资源入口。
 *
 * 资源由 `src/assets/map/icon` 提供（dispatchMap.vue / map.vue 也直接引用该目录），
 * 样式侧统一从此处取值，
 * 业务代码不允许再散写图标 URL 字面量。
 *
 * 注意：`new URL()` 的路径必须是字面量，Vite 才能在构建期完成资源指纹与产物定位。
 */
export const MAP_ICON_SRC = {
  alarm: new URL('../../../assets/map/icon/alarm.png', import.meta.url).toString(),
  jrAlarmActive: new URL('../../../assets/map/icon/即时警情.png', import.meta.url).toString(),
  jrAlarmGray: new URL('../../../assets/map/icon/即时警情-灰.png', import.meta.url).toString(),
  fireEngine: new URL('../../../assets/map/icon/fire-engine.svg', import.meta.url).toString(),
  car: new URL('../../../assets/map/icon/car.png', import.meta.url).toString(),
  point: new URL('../../../assets/map/icon/poi.png', import.meta.url).toString(),
  endPoint: new URL('../../../assets/map/icon/shui.png', import.meta.url).toString(),
  primaryStation: new URL('../../../assets/map/icon/zhu.png', import.meta.url).toString(),
} as const

/** mock / 在线车辆图标（GC-03） */
export const CAR_ICON = MAP_ICON_SRC.car

/** 消防站图标 */
export const FIRE_STATION_ICON = new URL('../../../assets/map/icon/xfz.png', import.meta.url).toString()

/**
 * 通用警情图标名规则：`${colorType}-${type}.svg`。
 * 例：`red-fire.svg` / `blue-rescue.svg` / `grey-society.svg`。
 * 沿用既有实现：文件名可枚举，运行时按需拼装。
 */
export const getCommonAlarmIconSrc = (colorType: string, type: string): string =>
  new URL(`../../../assets/map/icon/${colorType}-${type}.svg`, import.meta.url).toString()
