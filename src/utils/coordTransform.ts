export type LngLat = [number, number]

const pi = Math.PI
const a = 6378245.0
const ee = 0.00669342162296594323

const outOfChina = (lng: number, lat: number) => lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271

const transformLat = (lng: number, lat: number) => {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
  ret += ((20.0 * Math.sin(6.0 * lng * pi) + 20.0 * Math.sin(2.0 * lng * pi)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(lat * pi) + 40.0 * Math.sin((lat / 3.0) * pi)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((lat / 12.0) * pi) + 320 * Math.sin((lat * pi) / 30.0)) * 2.0) / 3.0
  return ret
}

const transformLng = (lng: number, lat: number) => {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
  ret += ((20.0 * Math.sin(6.0 * lng * pi) + 20.0 * Math.sin(2.0 * lng * pi)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(lng * pi) + 40.0 * Math.sin((lng / 3.0) * pi)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((lng / 12.0) * pi) + 300.0 * Math.sin((lng / 30.0) * pi)) * 2.0) / 3.0
  return ret
}

export const wgs84ToGcj02 = (lngLat: LngLat): LngLat => {
  const [lng, lat] = lngLat
  if (outOfChina(lng, lat)) return [lng, lat]
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * pi
  let magic = Math.sin(radLat)
  magic = 1 - ee * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / (((a * (1 - ee)) / (magic * sqrtMagic)) * pi)
  dLng = (dLng * 180.0) / ((a / sqrtMagic) * Math.cos(radLat) * pi)
  return [lng + dLng, lat + dLat]
}

export const gcj02ToWgs84 = (lngLat: LngLat): LngLat => {
  const [lng, lat] = lngLat
  if (outOfChina(lng, lat)) return [lng, lat]
  const [mLng, mLat] = wgs84ToGcj02([lng, lat])
  return [lng * 2 - mLng, lat * 2 - mLat]
}

/**
 * 把经纬度格式化为 `经度,纬度` 文本（默认 6 位小数），用于复制到剪贴板或对外传递
 * @param lngLat [经度, 纬度]
 * @param digits 小数位数
 */
export const formatLngLat = (lngLat: LngLat, digits = 6): string => {
  const [lng, lat] = lngLat
  return `${lng.toFixed(digits)},${lat.toFixed(digits)}`
}

const xPi = (Math.PI * 3000.0) / 180.0

/** 百度 BD-09 -> 国测局 GCJ-02 */
export const bd09ToGcj02 = ([lng, lat]: LngLat): LngLat => {
  const x = lng - 0.0065
  const y = lat - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * xPi)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * xPi)
  return [z * Math.cos(theta), z * Math.sin(theta)]
}

/** 国测局 GCJ-02 -> 百度 BD-09 */
export const gcj02ToBd09 = ([lng, lat]: LngLat): LngLat => {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * xPi)
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * xPi)
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006]
}
