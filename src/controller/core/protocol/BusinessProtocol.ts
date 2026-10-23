import type { CarLocationPoint, PositionPayload } from './LegacyMessageProtocol'

export interface ConfigLayersData {
  layers: Array<{ id: string; visible: boolean }>
}

export interface ConfigBaseData {
  defaultCenter: [number, number]
  defaultZoom: number
}

export interface ConfigClearStrategyData {
  clearOnCaseClose: boolean
  keepHistoryCount: number
}

export interface AlarmProfileSyncData {
  incidentId: string
  disaster_address?: string
  longitude?: number
  latitude?: number
  disaster_type?: string
  disaster_type_lv2?: string
  incidentState?: string
  incidentStateName?: string
  disaster_des?: string
  is_trapped?: string
  trapped_position?: string
  trapped_num?: number
  is_casualty?: string
  buildingId?: string
  disasterTypeLabel?: string
}

export interface LayerSetVisibleData {
  layerId: string
  visible?: boolean
  timestamp?: number
}

export interface MapViewLoadData {
  points?: any[]
  longitude?: number
  latitude?: number
  zoom?: number
  code?: string
  padding?: number[]
}

export interface LocateCallData {
  id: string
  longitude: number
  latitude: number
  radius: number
  address?: string
  Carrier_Loc?: string
  positionPayload?: PositionPayload
}

export interface LocateCallRemoveData {
  id: string
}

export interface AoiEsQueryData {
  points: any[]
  layerNames: string[]
}

export interface AoiEsGisZoneData {
  zoneId: string
  zoneCode?: string
  zoneName?: string
  parentZoneId?: string
}

export interface DispatchViewportFitData {
  incidentId: string
  fitType: string
  zone_id?: string
  zone_name?: string
  center?: {
    longitude: number
    latitude: number
    coord_sys: string
  }
  includeAlarmPoint?: boolean
  includeStations?: boolean
  includeVehicles?: boolean
  includeRoutes?: boolean
}

export interface DispatchResourceQueryHighlightData {
  incidentId: string
  queryType: string
  center: {
    longitude: number
    latitude: number
    coord_sys: string
  }
  radius: number
  resourceTypes: string[]
  highlight: boolean
  visible: boolean
}

export interface DispatchRoutePlanData {
  incidentId: string
  dispatchPlanId?: string
  routeSource?: string
  start: {
    station_id: string
    stationName?: string
    longitude: number
    latitude: number
    coord_sys?: string
  }
  end: {
    disaster_address?: string
    longitude: number
    latitude: number
    coord_sys?: string
  }
  routeId: string
  eta: number
  distance: number
  recommended: boolean
  routeVisible?: boolean
}

export interface DispatchStationEtaFilterStationItem {
  station_id: string
  stationName?: string
  eta: number
  matched?: boolean
  visible?: boolean
}

export interface DispatchStationEtaFilterData {
  incidentId: string
  dispatchPlanId?: string
  etaMax?: number
  stationList?: DispatchStationEtaFilterStationItem[]
}

export interface DispatchRouteToggleRouteItem {
  routeId: string
  car_id?: string
  plate_number?: string
  eta?: number
  distance?: number
  routeVisible: boolean
}

export interface DispatchRouteToggleData {
  incidentId: string
  dispatchPlanId?: string
  station_id?: string
  stationName?: string
  toggleMode?: 'ALL' | 'PART'
  routeList: DispatchRouteToggleRouteItem[]
}

export interface TrackingVehicleGpsUpdateData {
  datas: CarLocationPoint[]
}

export interface TrackingVehicleRouteRealtimeData {
  incidentId: string
  dispatchPlanId?: string
  start: {
    carId: string
    carNumber?: string
    longitude: number
    latitude: number
    coord_sys?: string
  }
  end: {
    disaster_address?: string
    longitude: number
    latitude: number
    coord_sys?: string
  }
  routeId: string
  eta: number
  distance: number
}

/* ============ (Address Robot) ============ */

export interface AddressRobotGisSearchData {
  raw_text?: string
  confidence?: number
  highlight_entities?: Array<{
    anchor_id: string
    name: string
    anchor_type?: string
    anchor_level?: string
    highlight_role?: string
    lon?: number
    lat?: number
    geojson?: any
    [k: string]: any
  }>
  spatial_relations?: Array<{
    relation_type: string
    direction?: string
    distance?: number
    anchor_ids?: string[]
    [k: string]: any
  }>
  target_anchor_id?: string | null
  radius?: [number, number]
  status?: string
  need_ask?: string | null
  highlight_shape?: string
  candidates?: any[]
  [k: string]: any
}

export interface AddressRobotGisCandidatesData {
  source?: string
  status?: string
  candidates?: any[]
  [k: string]: any
}

export interface AddressRobotClearData {
  businessId?: string
}

/* ============ (Area Fence) ============ */

/**
 * 行政区划围栏高亮指令。
 * geometry 为 GeoJSON 几何（EPSG:4326 / WGS-84），
 * flash=true 时渲染器先闪烁高亮再落到常驻描边。
 */
export interface AreaFenceHighlightData {
  /** 行政区划编码 */
  areaCode: string
  /** 行政区划名称（用于图面标注） */
  areaName?: string
  /** 围栏几何 */
  geometry: GeoJSON.Geometry
  /** 是否先闪烁高亮 */
  flash?: boolean
  /** 描边色，默认取主题强调色 */
  strokeColor?: string
  /** 描边宽度 */
  strokeWidth?: number
}

/** 行政区划围栏清除指令 */
export interface AreaFenceClearData {
  /** 业务分组，缺省清除全部行政区划围栏 */
  businessId?: string
}
