/**
 * 消防站距离查询工具：根据消防站 ID 查询距离最近的其他消防站（gis:view_res_org_dept）。
 * 图层坐标系为 EPSG:4326 / WGS-84，入参经纬度顺序为 [经度, 纬度]。
 *
 * 辖区按点位查询的逻辑已移至 @/controller/core/business/IncidentStationQuery.ts
 * 的 queryJurisdictionAtPoint 函数。
 */
import { getDistance } from 'ol/sphere'
import { geoserverApi } from '@/service/geoserver'

/** 消防站图层，几何字段 geom */
const FIRE_STATION_TYPE_NAME = 'gis:view_res_org_dept'
/** 消防站单次拉取上限（与 useFireStations 保持一致） */
const FIRE_STATION_MAX_FEATURES = 1000

/** [经度, 纬度]，EPSG:4326 */
export type LngLatCoordinate = [number, number]

/** 最近消防站查询结果 */
export type NearestFireStationInfo = {
  geometry: GeoJSON.Geometry
  properties: {
    id: string
    org_name: string
  }
}

type WFSFeature = {
  geometry?: any
  properties?: Record<string, any>
}

/** 读取队站点位坐标，优先属性表 longitude/latitude，缺失时回退点几何；已删除或坐标无效返回 null */
const readStationCoordinate = (feature: WFSFeature): LngLatCoordinate | null => {
  const properties = feature?.properties ?? {}
  if (properties.is_deleted === true) return null
  const coordinates = feature?.geometry?.coordinates
  const longitude = Number(properties.longitude ?? coordinates?.[0])
  const latitude = Number(properties.latitude ?? coordinates?.[1])
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
  return [longitude, latitude]
}

/**
 * 根据消防站 ID 查询距离其最近的 N 个其他消防站。
 * 通过 WFS 拉取 gis:view_res_org_dept 全部队站，按球面距离排序后取前 N 个。
 * @param stationId 基准消防站 ID（view_res_org_dept.id）
 * @param count 返回数量，默认 3
 * @returns 最近队站列表（不含基准队站自身），按距离由近到远排序
 */
export const queryNearestFireStationsById = async (
  stationId: string,
  count = 3,
): Promise<NearestFireStationInfo[]> => {
  const targetId = String(stationId ?? '').trim()
  if (!targetId) throw new Error('查询最近消防站失败：stationId 不能为空')

  const data = await geoserverApi.getWFSFeatures(
    {
      typeName: FIRE_STATION_TYPE_NAME,
      outputFormat: 'application/json',
      srsName: 'EPSG:4326',
      maxFeatures: FIRE_STATION_MAX_FEATURES,
    },
    'gis',
  )

  const features = (data?.features ?? []) as WFSFeature[]

  const origin = readStationCoordinate(
    features.find((feature) => String(feature?.properties?.id ?? '').trim() === targetId) ??
      ({} as WFSFeature),
  )
  if (!origin) throw new Error(`未找到 ID 为 ${targetId} 的消防站`)

  const limit = Math.max(0, Math.floor(count))
  return features
    .map((feature) => {
      const id = String(feature?.properties?.id ?? '').trim()
      const coordinate = readStationCoordinate(feature)
      if (!id || id === targetId || !coordinate || !feature.geometry) return null
      return {
        id,
        feature,
        distance: getDistance(origin, coordinate),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ id, feature }) => ({
      geometry: feature.geometry as GeoJSON.Geometry,
      properties: {
        id,
        org_name: String(feature?.properties?.org_name ?? ''),
      },
    }))
}
