/**
 * @Description: 警情/调派相关队站图层 + 周边资源 WMS 图层的过滤状态 store。
 * 从 useIncidentLocationStore.ts 拆出，避免单文件嵌套定义多个 store。
 * - useStationLayerStore：队站 WMS 图层（gis:view_res_org_dept）按 ownerKey 声明的过滤状态；
 * - useNearbyResourceLayerStore：周边资源 WMS 图层（消防栓/重点单位）按 ownerKey 声明的范围圈。
 * 地图侧取各业务方声明的并集拼 CQL_FILTER / DWITHIN 强制上图，全部清空后恢复原始可见性。
 * @FilePath: src/store/useStationLayerStore.ts
 */
import { defineStore } from 'pinia'
import { computed, reactive } from 'vue'

/**
 * 警情/调派相关队站图层（唯一 WMS 图层 gis:view_res_org_dept）的过滤状态。
 * 多个业务方（警情定位各点位、DispatchT1 立案查询）按 ownerKey 声明各自需要
 * 显示的主管/支撑队站 ID，地图侧取并集对 WMS 图层做 CQL_FILTER 并强制显示；
 * 所有业务方清空后，由地图侧恢复图层开关的原始可见性与过滤条件。
 */
export const useStationLayerStore = defineStore('stationLayerStore', () => {
  /** ownerKey -> 需要显示的队站 ID 列表（如 loc:${markerKey} / dispatchT1） */
  const entries = reactive<Record<string, string[]>>({})
  /** ownerKey -> 主管队站 ID 列表（主管以独立 zhu.png 图标上图，需从全量消防站图层排除避免重叠） */
  const primaryEntries = reactive<Record<string, string[]>>({})
  /** 全部业务方声明的队站 ID 并集，供地图侧生成 CQL_FILTER */
  const selectedStationIds = computed<string[]>(() => {
    const union = new Set<string>()
    Object.values(entries).forEach((ids) => {
      ids.forEach((id) => union.add(id))
    })
    return [...union]
  })
  /** 全部业务方声明的主管队站 ID 并集，供地图侧从全量消防站图层排除 */
  const primaryStationIds = computed<string[]>(() => {
    const union = new Set<string>()
    Object.values(primaryEntries).forEach((ids) => {
      ids.forEach((id) => union.add(id))
    })
    return [...union]
  })
  const normalizeIds = (ids: string[]) => [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))]
  const setStations = (owner: string, ids: string[]) => {
    entries[owner] = normalizeIds(ids)
  }
  /** 声明某业务方当前的主管队站（独立图标上图，全量图层中排除） */
  const setPrimaryStations = (owner: string, ids: string[]) => {
    primaryEntries[owner] = normalizeIds(ids)
  }
  const clearOwner = (owner: string) => {
    delete entries[owner]
    delete primaryEntries[owner]
  }
  return {
    entries,
    primaryEntries,
    selectedStationIds,
    primaryStationIds,
    setStations,
    setPrimaryStations,
    clearOwner,
  }
})

/** 警情定位点位在队站图层 store 中使用的 owner 前缀 */
export const LOCATION_STATION_OWNER_PREFIX = 'loc:'
/** DispatchT1 立案查询在队站图层 store 中使用的固定 owner */
export const DISPATCH_T1_STATION_OWNER = 'dispatchT1'

/**
 * 周边资源查询范围圈（圆心 EPSG:4326 [经度, 纬度] + 半径米）。
 * 地图侧对消防栓/重点单位 WMS 图层按各 owner 范围圈并集拼 DWITHIN CQL_FILTER。
 */
export type NearbyResourceCircle = {
  lng: number
  lat: number
  radiusMeters: number
}

/**
 * 警情定位周边资源 WMS 图层（消防栓 gis:env_fire_water / 重点单位 gis:view_env_enterprises）
 * 的范围圈声明。多个警情点位按 ownerKey 各自声明一个 500 米范围圈，
 * 地图侧取并集对两个图层下 DWITHIN CQL_FILTER 并强制显示；
 * 所有业务方清空后，由地图侧恢复图层开关的原始可见性、minZoom 与过滤条件。
 */
export const useNearbyResourceLayerStore = defineStore('nearbyResourceLayerStore', () => {
  /** ownerKey -> 该业务方声明的范围圈（警情定位每个点位一个圈） */
  const entries = reactive<Record<string, NearbyResourceCircle[]>>({})
  /** 全部业务方声明范围圈的并集，供地图侧拼 CQL_FILTER */
  const circles = computed<NearbyResourceCircle[]>(() => {
    const union: NearbyResourceCircle[] = []
    Object.values(entries).forEach((list) => union.push(...list))
    return union
  })
  const setCircles = (owner: string, list: NearbyResourceCircle[]) => {
    entries[owner] = list.filter(
      (circle) =>
        Number.isFinite(circle.lng) &&
        Number.isFinite(circle.lat) &&
        Number.isFinite(circle.radiusMeters) &&
        circle.radiusMeters > 0,
    )
  }
  const clearOwner = (owner: string) => {
    delete entries[owner]
  }
  return {
    entries,
    circles,
    setCircles,
    clearOwner,
  }
})

/** 警情定位点位在周边资源图层 store 中使用的 owner 前缀 */
export const LOCATION_RESOURCE_OWNER_PREFIX = 'locres:'
