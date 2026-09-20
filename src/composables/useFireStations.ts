import { ref } from 'vue'
import { getDistance } from 'ol/sphere'
import { geoserverApi } from '@/service/geoserver'
import type { ZhxfStationData } from '@/baseComponent/amap/mapData'

/** 主管队站 WFS 图层（GeoServer 发布，坐标系 EPSG:4326 / WGS-84） */
export const FIRE_STATION_TYPE_NAME = 'gis:view_res_org_dept'

type WFSFeature = {
  id?: string | number
  geometry?: { type?: string; coordinates?: number[] }
  properties?: Record<string, any>
}

type WFSFeatureCollection = {
  type?: string
  features?: WFSFeature[]
}

export type NearestFireStation = {
  station: ZhxfStationData
  distanceMeters: number
}

const pickFiniteNumber = (...values: unknown[]): number => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return NaN
}

const pickNonEmptyString = (...values: unknown[]): string => {
  for (const value of values) {
    if (value === null || value === undefined) continue
    const str = String(value).trim()
    if (str) return str
  }
  return ''
}

/**
 * WFS 队站要素 → ZhxfStationData。
 * 服务本身为 EPSG:4326，坐标无需再做 GCJ-02 转换；
 * 优先取属性表中的 longitude/latitude，缺失时回退点几何坐标。
 */
export const normalizeFireStation = (
  feature: WFSFeature,
): ZhxfStationData | null => {
  const properties = feature?.properties ?? {}
  if (properties.is_deleted === true) return null

  const coordinates = feature?.geometry?.coordinates
  const lng = pickFiniteNumber(
    properties.longitude,
    properties.gisX,
    coordinates?.[0],
  )
  const lat = pickFiniteNumber(
    properties.latitude,
    properties.gisY,
    coordinates?.[1],
  )
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null

  const id = pickNonEmptyString(properties.id, feature?.id)
  if (!id) return null

  const phone = pickNonEmptyString(
    properties.contacter_phone,
    properties.dispatch_phone,
    properties.phone,
  )

  return {
    id,
    lng,
    lat,
    title:
      pickNonEmptyString(
        properties.org_name,
        properties.simple_org_name,
        properties.org_simple,
        properties.name,
      ) || '未命名消防站',
    address:
      pickNonEmptyString(properties.org_address, properties.address) ||
      '暂无地址',
    phone: phone || undefined,
    deviceTotal: pickFiniteNumber(properties.device_total) || 0,
    deviceOnline: pickFiniteNumber(properties.device_online) || 0,
    deviceGoouts: pickFiniteNumber(properties.device_goouts) || 0,
    source: 'WFS',
  }
}

/** 直接请求 WFS 获取主管队站列表 */
export const fetchFireStations = async (
  maxFeatures = 1000,
): Promise<ZhxfStationData[]> => {
  const data = (await geoserverApi.getWFSFeatures(
    {
      typeName: FIRE_STATION_TYPE_NAME,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      maxFeatures,
    },
    'gis',
  )) as WFSFeatureCollection

  return (data?.features ?? [])
    .map(normalizeFireStation)
    .filter((item): item is ZhxfStationData => item !== null)
}

// 跨组件共享同一份队站数据与请求（NavPanel / map / dispatchMap 复用缓存）
const stations = ref<ZhxfStationData[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref<unknown>(null)
let pendingPromise: Promise<ZhxfStationData[]> | null = null

/** 球面距离找最近队站 */
export const findNearestFireStation = (
  target: [number, number],
  list: ZhxfStationData[],
): NearestFireStation | null => {
  let best: ZhxfStationData | null = null
  let bestDist = Infinity
  for (const station of list) {
    if (!Number.isFinite(station?.lng) || !Number.isFinite(station?.lat)) {
      continue
    }
    const distance = getDistance(target, [station.lng, station.lat])
    if (distance < bestDist) {
      bestDist = distance
      best = station
    }
  }
  return best ? { station: best, distanceMeters: bestDist } : null
}

/**
 * 主管队站数据源：WFS gis:view_res_org_dept（EPSG:4326，无需坐标转换）。
 * 模块级单例，多个地图组件共享同一份缓存与在途请求。
 */
export const useFireStations = () => {
  /** 加载队站；force=true 时强制刷新，否则复用缓存/在途请求 */
  const load = (force = false): Promise<ZhxfStationData[]> => {
    if (!force && loaded.value) return Promise.resolve(stations.value)
    if (!force && pendingPromise) return pendingPromise

    loading.value = true
    error.value = null
    const promise = fetchFireStations()
      .then((list) => {
        stations.value = list
        loaded.value = true
        return list
      })
      .catch((e) => {
        error.value = e
        throw e
      })
      .finally(() => {
        loading.value = false
        pendingPromise = null
      })
    pendingPromise = promise
    return promise
  }

  /** 确保队站已加载后，返回距目标点最近的队站 */
  const getNearestFireStation = async (
    target: [number, number],
  ): Promise<NearestFireStation | null> => {
    const list = loaded.value ? stations.value : await load()
    return findNearestFireStation(target, list)
  }

  return {
    stations,
    loading,
    loaded,
    error,
    load,
    getNearestFireStation,
  }
}
