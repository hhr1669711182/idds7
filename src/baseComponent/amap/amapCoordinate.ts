import { gcj02ToWgs84, wgs84ToGcj02, type LngLat } from '@/utils/coordTransform.ts'

export type { LngLat }

export const amapGcj02ToWgs84 = (lngLat: LngLat): LngLat => gcj02ToWgs84(lngLat)

export const toAmapGcj02 = (lngLat: LngLat): LngLat => wgs84ToGcj02(lngLat)

export const toAmapLngLatString = (lngLat: LngLat) => {
  const [lng, lat] = toAmapGcj02(lngLat)
  return `${lng},${lat}`
}

export const parseAmapLocation = (location: string): LngLat | undefined => {
  const [lngText, latText] = `${location ?? ''}`.split(',')
  const lng = Number(lngText)
  const lat = Number(latText)

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return undefined
  }

  return amapGcj02ToWgs84([lng, lat])
}

export const parsePolyline = (polyline: string): LngLat[] => {
  if (!polyline) return []

  return polyline
    .split(';')
    .map((pair) => parseAmapLocation(pair.trim()))
    .filter((point): point is LngLat => !!point)
}

/** 路径代理接收 WGS84，服务端负责转换为高德坐标；直连高德仍用 toAmapLngLatString。 */
export const toRouteProxyLngLatString = ([lng, lat]: LngLat): string => `${lng},${lat}`

/**
 * 路径代理的 GeoJSON geometry 已声明为 EPSG:4326（WGS84）。
 * 这里只做数值校验，不能再执行 GCJ-02 -> WGS84，否则会产生二次纠偏。
 */
export const parseWgs84Coordinates = (coordinates: ReadonlyArray<ReadonlyArray<number>>): LngLat[] =>
  coordinates
    .map((point): LngLat | undefined => {
      const lng = Number(point?.[0])
      const lat = Number(point?.[1])
      return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : undefined
    })
    .filter((point): point is LngLat => !!point)

export const parseMultiPolyline = (polylineGroup: string): LngLat[][] => {
  if (!polylineGroup) return []

  return polylineGroup
    .split('|')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(parsePolyline)
    .filter((ring) => ring.length >= 3)
}
