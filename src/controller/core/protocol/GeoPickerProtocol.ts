/**
 * 对外选点 / 选辖区（GeoPicker）协议层 DTO。
 *
 * 用于 iframe 嵌入场景下，子页面（ids-gis-web）与宿主之间的 postMessage 通信。
 * 坐标统一 WGS84：[经度, 纬度]。
 */

/** 画点回传结果（子→宿主） */
export interface GeoPickerPointResult {
  /** 经度（WGS84） */
  lng: number
  /** 纬度（WGS84） */
  lat: number
}

/** 画辖区回传结果（子→宿主）：GeoJSON Polygon 的 coordinates */
export interface GeoPickerJurisdictionResult {
  /** 面坐标，number[][][]，WGS84 */
  coordinates: number[][][]
}

/** 宿主→子：定位指令（飞到指定经纬度） */
export interface GeoPickerLocateCommand {
  /** 经度（WGS84） */
  lng: number
  /** 纬度（WGS84） */
  lat: number
  /** 可选缩放级别 */
  zoom?: number
}

/** 子→宿主：地图就绪通知 */
export interface GeoPickerReadyEvent {
  /** 底图与工具是否就绪 */
  ok: boolean
}
