// 用途：调派「纠缠体」——把调派专属地图逻辑（警情定位点位 / 队站 CQL / 周边资源范围圈 /
// 模拟调派 / 车辆轨迹）绑到 map.vue 常驻 OLMap 上，可 attach/detach。设计见
// herness/02-技术设计/前端/路线X-Y地图实例归一重构.md。
import { watch, markRaw, ref, computed, nextTick } from 'vue'
import type OLMap from 'ol/Map'
import { Modify } from 'ol/interaction'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import CircleGeom from 'ol/geom/Circle'
import { fromLonLat, transform } from 'ol/proj'
import * as olProj from 'ol/proj'
import type { EventsKey } from 'ol/events'
import { unByKey } from 'ol/Observable'
import { Fill, Stroke, Style } from 'ol/style'
import type Overlay from 'ol/Overlay'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { EventBus } from '@/utils/mitt.ts'

import { MAP_LAYER_Z_INDEX } from './layerOrder'
import {
  FeatureClickQuery,
  INCIDENT_PRIMARY_STATION_LAYER_CLASS,
  RESOURCE_CIRCLE_LAYER_CLASS,
} from './FeatureClickQuery.ts'
import { mountPointLayer, type PointLayerManager } from '@/baseComponent/OpenlayersMap/mountPointLayer.ts'
import { getStyle, MAP_ICON_SRC } from '@/baseComponent/OpenlayersMap/style'
import { createVehicleTrackRenderer, type VehicleTrackRenderer } from './VehicleTrackRenderer'
import type { GisBaseMapApi } from './useGisBaseMap.ts'
import { getDispatchBusiness } from './dispatchBusiness'

import {
  useIncidentLocationStore,
  type IncidentLocationFocusRequest,
  type IncidentLocationMarker,
  type IncidentPrimaryStation,
  type IncidentLocationRoutePlanRequest,
} from '@/store/useIncidentLocationStore'
import {
  useStationLayerStore,
  useNearbyResourceLayerStore,
  LOCATION_RESOURCE_OWNER_PREFIX,
  type NearbyResourceCircle,
} from '@/store/useStationLayerStore'
import {
  STATION_LAYER_NAME,
  cqlLiteral,
  queryStationCoordinatesByIds,
} from '@/controller/core/business/IncidentStationQuery'
import {
  FIRE_HYDRANT_LAYER_NAME,
  KEY_ENTERPRISE_LAYER_NAME,
  JURIS_ZONE_LAYER_NAME,
  BUILDING_LAYER_NAME,
  buildCircleIntersectsCql,
  queryIncidentNearbyResources,
} from '@/controller/core/business/IncidentNearbyResourceQuery'
import { type IncidentVideoOverlayController } from '@/controller/core/business/IncidentVideoOverlayController'
import { type SpecialMapMock } from './specialMapMock'
import { type IncidentRelocate } from './incidentRelocate'
import type { GenericController } from '@/controller/core/generic'
import type { CallController } from '@/controller/core/business/CallController'

import {
  fetchInputTips,
  type AmapDrivingResult,
  type LngLat,
  type RouteVideoCheckpointEvent,
  type AmapRealtimeNav,
} from '@/baseComponent/amap/useAmapTools.ts'
import type { CarItem } from '@/composables/useCarFeatures'
import type { JRAlarmData } from '@/baseComponent/amap/mapData.ts'
import { useFireStations } from '@/composables/useFireStations'

import { useUserStore } from '@/store/useUserStore'
import { getBusinessMessageRuntime } from '@/controller/core/io/BusinessMessageRuntime'
import { createBusinessMapPort } from './businessMapPort'
import { MESSAGE_EVENT_KEY, MOCK_CALL_LOCATION_ID } from '@/const/const.message.type'
import { useMessageStore } from '@/store/useMessageStore'
import { INCOMING_CALL_FOCUS_ZOOM, usePendingCallLocationStore } from '@/store/usePendingCallLocationStore'
import type { SharedDispatchVehicleMock } from '@/composables/useMockCallLocationBridge'
import {
  queryCarHistoryTrack,
  extractLatestBatchFirstVehicleId,
  queryIncidentTurnoutVehicles,
  groupTurnoutVehiclesByStation,
  supplementTrackTimeFromDetail,
} from '@/apis/carTrack'
import { useVehicleTrackStore, type VehicleTrackEntry } from '@/store/useVehicleTrackStore'
import { isTerminalIncidentState } from '@/utils/incidentState'
import { createLogger } from '@/utils/logger'
import {
  toIncidentDetailData,
  type IncidentDetailData,
  type IncidentDetailResponseData,
} from './IncidentDetailDialog.vue'
import {
  getSelectedRoute,
  matchStationRoute,
  type RouteAlternative,
  type StationRouteAlternatives,
} from '@/baseComponent/amap/routeAlternatives'
import amapData from '@/assets/map/config/data.json'
import { fetchIncidentDetail } from '@/apis/incidentProfile'

// ---------------------------------------------------------------------------
// 注入契约
// ---------------------------------------------------------------------------

/** map.vue 创建的共享设施句柄（本 composable 只消费，不 mount） */
export interface DispatchEntangledDeps {
  /** 常驻 OLMap 实例（永不 unmount） */
  map: OLMap
  /** 高德实时导航控制器（map.vue initMap 后设置） */
  nav: AmapRealtimeNav
  /** 统一 GIS 底座（WMS 图层 + zoom），CQL/范围圈经它操作 WMS */
  gisBaseMap: GisBaseMapApi
  /** 共享消防站图层管理器（mountFireStations 返回） */
  fireManager: {
    setVisible: (v: boolean) => void
    setStations?: (stations: import('@/baseComponent/amap/mapData.ts').ZhxfStationData[]) => void
    hide: () => void
  } | null
  /** 共享在线车辆图层管理器（mountCarFeatures 返回） */
  carManager: {
    setVisible: (v: boolean) => void
    fetch?: () => Promise<unknown>
    layer: { set: (key: string, value: unknown) => void }
  } | null
  /** 共享警情 overlay 管理器（nav.mountAlarmOverlay 返回） */
  alarmOverlayManager: {
    overlay: Overlay
    showAtAlarm: () => void
    hide: () => void
  } | null
  /** 共享今日灾情图层管理器（mountJRAlarmLayer 返回） */
  jrAlarmManager: { setData?: (alarms: JRAlarmData[]) => void } | null
}

export const useDispatchEntangled = (deps: DispatchEntangledDeps) => {
  // =========================================================================
  // 状态与依赖绑定（原 dispatchMap.vue L272-368，`map`/`nav` 绑定到 deps，
  // 无端口 section 再赋值 map/nav，故 verbatim 复制引用不变）
  // =========================================================================
  const { map, nav, gisBaseMap, fireManager, carManager, alarmOverlayManager } = deps

  /** 是否处于激活态（variant→dispatch 时 true）；route/focus 等无 manager 守卫的 watch 用它门控 */
  let active = false

  // ---- 各 store（与主图共享同一 Pinia 实例） ----
  const incidentLocationStore = useIncidentLocationStore()
  const messageStore = useMessageStore()
  const userStore = useUserStore()
  const pendingCallLocationStore = usePendingCallLocationStore()
  const stationLayerStore = useStationLayerStore()
  const nearbyResourceLayerStore = useNearbyResourceLayerStore()
  const { stations: fireStations, getNearestFireStation } = useFireStations()
  // 全量队站直接读共享 fireStations（map.vue 的 loadFireStations() 填充同一共享 ref）；
  // 主管队站改由独立 zhu.png 图标上图，fireManager 填充时排除主管 id。

  // ---- B-1/B-2 独立设施句柄（activate 时经 getDispatchBusiness() 懒取，
  //      因这些设施由 attachDispatchBusiness() 在 dispatch variant 下才创建） ----
  let incidentVideoController: IncidentVideoOverlayController | null = null
  let specialMapMock: SpecialMapMock | null = null
  let incidentRelocate: IncidentRelocate | null = null
  let callLocationController: CallController | null = null
  let callLocationGenericController: GenericController | null = null

  /** 特殊地图激活标志：激活时 selectStationRoute 不写 lastRoutePlanResults，避免污染原有调派 */
  let specialMapActive = false
  /** 模拟调派渲染代际：mock.render 每调一次自增，作废在途 disasterSite/simulate 回调 */
  let mockMapGeneration = 0

  // ---- 警情定位点位图层管理器（activate 时 mount，deactivate 时 destroy） ----
  let incidentLocationManager: PointLayerManager<IncidentLocationMarker> | null = null
  /** 已渲染进图层的点位快照，用于与 store 数据 diff 出 upsert/remove */
  let renderedMarkers = new globalThis.Map<string, IncidentLocationMarker>()
  /** 主管队站独立图标图层（zhu.png）管理器 */
  let primaryStationManager: PointLayerManager<IncidentPrimaryStation> | null = null
  /** 已渲染进主管图层的点位快照 */
  let renderedPrimaryStations = new globalThis.Map<string, IncidentPrimaryStation>()
  const INCIDENT_LOCATION_LAYER_ZINDEX = MAP_LAYER_Z_INDEX.incident
  const INCIDENT_LOCATION_LAYER_CLASS = 'INCIDENT_LOCATION_ALARM_LAYER'
  const INCIDENT_LOCATION_FOCUS_ZOOM = 15

  /** 调派专属 FeatureClickQuery 实例（带 getStationRouteInfo，activate 建 + activate()） */
  let featureClickQuery: FeatureClickQuery | null = null
  /** 三类点位统一弹窗的 singleclick 监听 key（若挂载统一点击则记录；本 B-3c 弹窗 DOM 属 B-6c，暂不挂） */
  let unifiedPopupClickKey: EventsKey | null = null

  /** 队站图层强制过滤的现场快照：CQL 占用消防站 WMS 后释放时恢复 */
  let forcedStationLayerSnapshot: WmsLayerSnapshot | null = null

  // 非调派状态下支撑队站不渲染；模拟调派期间通过该 owner 按调派支撑 id 过滤上图
  const MOCK_DISPATCH_STATION_OWNER = 'mockDispatch'

  /**
   * 模拟调派期间主管队站图标（zhu.png）门控：
   * 非 null 时主管图层只放行集合内（本次参与路径规划）的主管站 id；null 表示恢复全量。
   */
  let mockDispatchPrimaryGate: Set<string> | null = null

  /** slotChanges 已形成有效警情点后，才结束来电粗定位圈 */
  const clearActiveCallLocation = () => {
    const activeCall = pendingCallLocationStore.getActive()
    if (!activeCall) return
    callLocationController?.locateCallRemove({ id: activeCall.id })
    pendingCallLocationStore.consume(activeCall.id)
  }

  /** 将地图视图定位到指定坐标（不低于 FOCUS_ZOOM） */
  const focusMapView = (target: OLMap, point: { lng: number; lat: number }) => {
    if (!map) return
    if (!point.lng || !point.lat) return
    const view = target.getView()
    const minimumZoom = pendingCallLocationStore.getActive() ? INCOMING_CALL_FOCUS_ZOOM : INCIDENT_LOCATION_FOCUS_ZOOM
    view.animate({
      center: olProj.fromLonLat([point.lng, point.lat]),
      zoom: Math.max(view.getZoom() ?? 0, minimumZoom),
      duration: 300,
    })
  }

  // =========================================================================
  // CQL / 范围圈（原 L369-746）：队站 WMS 过滤 + 周边资源范围圈矢量图层 + Modify
  // =========================================================================
  const buildStationCqlFilter = (ids: string[]) => ids.map((id) => `id=${cqlLiteral(id)}`).join(' OR ')

  /** WMS 图层被 CQL 强占前的现场快照（visible/minZoom/CQL_FILTER 原值） */
  type WmsLayerSnapshot = {
    existed: boolean
    prevVisible: boolean
    hadCqlFilter: boolean
    prevMinZoom: number
  }

  /** 释放 CQL 强占：按快照恢复图层可见性、缩放下限与过滤条件（原本不存在的图层直接移除） */
  const restoreWmsLayerSnapshot = (layerName: string, snapshot: WmsLayerSnapshot) => {
    const layer = gisBaseMap.getWmsLayer(layerName)
    const source = layer?.getSource()
    if (layer && source) {
      if (snapshot.hadCqlFilter) {
        source.updateParams({ CQL_FILTER: '1=1' })
      } else {
        const params = { ...source.getParams() }
        delete params.CQL_FILTER
        source.updateParams(params)
      }
      layer.setVisible(snapshot.prevVisible)
      layer.setMinZoom(snapshot.prevMinZoom)
      if (!snapshot.existed) gisBaseMap.removeLayer(layerName)
    }
  }

  /** 按共享队站 store 的并集对唯一 WMS 消防站图层应用/恢复 CQL_FILTER */
  const syncStationLayerOverride = () => {
    if (!map) return
    const primaryIds = new Set(stationLayerStore.primaryStationIds.map((id) => String(id).trim()))
    const ids = stationLayerStore.selectedStationIds.filter((id) => !primaryIds.has(String(id).trim()))
    if (ids.length) {
      const existed = gisBaseMap.hasWmsLayer(STATION_LAYER_NAME)
      let layer = gisBaseMap.getWmsLayer(STATION_LAYER_NAME)
      if (!layer) {
        if (!gisBaseMap.addLayer(STATION_LAYER_NAME)) return
        layer = gisBaseMap.getWmsLayer(STATION_LAYER_NAME)
      }
      if (!layer) return
      const source = layer.getSource()
      if (!source) return
      if (!forcedStationLayerSnapshot) {
        forcedStationLayerSnapshot = {
          existed,
          prevVisible: layer.getVisible(),
          hadCqlFilter: Object.prototype.hasOwnProperty.call(source.getParams(), 'CQL_FILTER'),
          prevMinZoom: layer.getMinZoom(),
        }
      }
      const dispatchIds =
        stationLayerStore.entries[MOCK_DISPATCH_STATION_OWNER]?.filter((id) => !primaryIds.has(String(id).trim())) ?? []
      if (dispatchIds.length) {
        source.updateParams({ CQL_FILTER: buildStationCqlFilter(dispatchIds) })
        layer.setMinZoom(0)
        layer.setVisible(true)
      } else {
        source.updateParams({ CQL_FILTER: '1=2' })
        layer.setVisible(false)
      }
      return
    }
    if (!forcedStationLayerSnapshot) return
    const snapshot = forcedStationLayerSnapshot
    forcedStationLayerSnapshot = null
    restoreWmsLayerSnapshot(STATION_LAYER_NAME, snapshot)
  }

  const onStationLayerChange = () => {
    if (!active) return
    syncStationLayerOverride()
  }

  /** 各周边资源 WMS 图层强制过滤的现场快照（key = 图层名） */
  const NEARBY_RESOURCE_LAYER_NAMES = [
    FIRE_HYDRANT_LAYER_NAME,
    KEY_ENTERPRISE_LAYER_NAME,
    JURIS_ZONE_LAYER_NAME,
    BUILDING_LAYER_NAME,
  ] as const
  const forcedResourceLayerSnapshots = new globalThis.Map<
    string,
    {
      existed: boolean
      prevVisible: boolean
      hadCqlFilter: boolean
      prevMinZoom: number
    }
  >()

  /** 各周边资源图层空间过滤的几何字段名（辖区为 zone_geom，其余为 geom） */
  const RESOURCE_LAYER_GEOM_FIELDS: Record<string, string> = {
    [FIRE_HYDRANT_LAYER_NAME]: 'geom',
    [KEY_ENTERPRISE_LAYER_NAME]: 'geom',
    [JURIS_ZONE_LAYER_NAME]: 'zone_geom',
    [BUILDING_LAYER_NAME]: 'geom',
  }

  /** 多个警情点范围圈拼"圆面相交"OR 过滤（带 SRID=4326 前缀） */
  const buildResourceCircleCqlFilter = (circles: NearbyResourceCircle[], geomField: string) =>
    circles
      .map((circle) => buildCircleIntersectsCql(geomField, [circle.lng, circle.lat], circle.radiusMeters))
      .join(' OR ')

  /** 对单个周边资源 WMS 图层按范围圈并集应用/恢复 CQL_FILTER */
  const syncOneResourceLayerOverride = (layerName: string) => {
    if (!map) return
    const circles = nearbyResourceLayerStore.circles
    if (circles.length) {
      const existed = gisBaseMap.hasWmsLayer(layerName)
      let layer = gisBaseMap.getWmsLayer(layerName)
      if (!layer) {
        if (!gisBaseMap.addLayer(layerName)) return
        layer = gisBaseMap.getWmsLayer(layerName)
      }
      if (!layer) return
      const source = layer.getSource()
      if (!source) return
      if (!forcedResourceLayerSnapshots.has(layerName)) {
        forcedResourceLayerSnapshots.set(layerName, {
          existed,
          prevVisible: layer.getVisible(),
          hadCqlFilter: Object.prototype.hasOwnProperty.call(source.getParams(), 'CQL_FILTER'),
          prevMinZoom: layer.getMinZoom(),
        })
      }
      const geomField = RESOURCE_LAYER_GEOM_FIELDS[layerName] ?? 'geom'
      source.updateParams({
        CQL_FILTER: buildResourceCircleCqlFilter(circles, geomField),
      })
      layer.setMinZoom(0)
      layer.setVisible(true)
      return
    }
    const snapshot = forcedResourceLayerSnapshots.get(layerName)
    if (!snapshot) return
    forcedResourceLayerSnapshots.delete(layerName)
    restoreWmsLayerSnapshot(layerName, snapshot)
  }

  /** 范围圈填充色（淡橙），与来电定位圈（蓝）区分 */
  const RESOURCE_CIRCLE_FILL = 'rgba(255, 140, 0, 0.12)'
  const RESOURCE_CIRCLE_STROKE = 'rgba(255, 140, 0, 0.9)'
  /** 范围圈 feature id 前缀（与来电定位圈区分，互不干扰） */
  const RESOURCE_CIRCLE_FEATURE_ID = 'nearby_resource_circle'
  /** 范围圈图层 zIndex：位于警情点位（incident=1003.5）之下 */
  const RESOURCE_CIRCLE_LAYER_Z_INDEX = MAP_LAYER_Z_INDEX.incident - 0.1

  /** Web Mercator(EPSG:3857) 投影米 ↔ 地面米换算 */
  const mercatorMetersToGround = (projectedMeters: number, latDeg: number) =>
    projectedMeters * Math.cos((latDeg * Math.PI) / 180)
  const groundMetersToMercator = (groundMeters: number, latDeg: number) =>
    groundMeters / Math.cos((latDeg * Math.PI) / 180)

  /** 警情点周边资源范围圈独立矢量图层（懒初始化） */
  let resourceCircleLayer: VectorLayer<VectorSource> | null = null
  /** Modify 交互实例，范围圈上图时激活、清除时移除 */
  let resourceCircleModify: Modify | null = null
  /** 拖拽中标志：拖拽期间跳过 store→图层同步，避免循环更新 */
  let resourceCircleDragging = false

  /** 创建范围圈独立矢量图层 + Modify 交互 */
  const ensureResourceCircleLayer = () => {
    if (!map || resourceCircleLayer) return
    const source = markRaw(new VectorSource({ wrapX: false }))
    resourceCircleLayer = markRaw(
      new VectorLayer({
        source,
        className: RESOURCE_CIRCLE_LAYER_CLASS,
        zIndex: RESOURCE_CIRCLE_LAYER_Z_INDEX,
        style: new Style({
          fill: new Fill({ color: RESOURCE_CIRCLE_FILL }),
          stroke: new Stroke({ color: RESOURCE_CIRCLE_STROKE, width: 2 }),
        }),
      }),
    )
    map.addLayer(resourceCircleLayer)
    resourceCircleModify = markRaw(
      new Modify({
        source,
        pixelTolerance: 8,
        condition: (evt) =>
          !map!.hasFeatureAtPixel(evt.pixel, {
            hitTolerance: 6,
            layerFilter: (targetLayer) => targetLayer.getClassName() === INCIDENT_LOCATION_LAYER_CLASS,
          }),
      }),
    )
    map.addInteraction(resourceCircleModify)
    resourceCircleModify.on('modifystart', () => {
      resourceCircleDragging = true
    })
    resourceCircleModify.on('modifyend', () => {
      resourceCircleDragging = false
      if (!resourceCircleLayer) return
      const source = resourceCircleLayer.getSource()
      if (!source) return
      const feature = source.getFeatureById(RESOURCE_CIRCLE_FEATURE_ID)
      if (!feature) return
      const geom = feature.getGeometry() as CircleGeom | null
      if (!geom) return
      const center = geom.getCenter()
      const projectedRadius = geom.getRadius()
      const centerLonLat = transform(center, 'EPSG:3857', 'EPSG:4326')
      const radius = mercatorMetersToGround(projectedRadius, centerLonLat[1])
      if (!Number.isFinite(radius) || radius <= 0) return
      const owners = Object.keys(nearbyResourceLayerStore.entries)
      if (!owners.length) return
      nearbyResourceLayerStore.setCircles(owners[0], [
        {
          lng: centerLonLat[0],
          lat: centerLonLat[1],
          radiusMeters: radius,
        },
      ])
      const markerKey = owners[0].replace(LOCATION_RESOURCE_OWNER_PREFIX, '')
      const marker = incidentLocationStore.markers[markerKey]
      if (marker) {
        void queryIncidentNearbyResources([centerLonLat[0], centerLonLat[1]], {
          radiusMeters: radius,
        })
          .then((result) => {
            incidentLocationStore.nearbyResources[markerKey] = {
              key: markerKey,
              radiusMeters: radius,
              fireHydrants: result.fireHydrants,
              keyEnterprises: result.keyEnterprises,
              jurisZones: result.jurisZones,
              buildings: result.buildings,
              version: marker.version,
            }
          })
          .catch((error) => {
            console.warn('[resource-circle] 拖拽后重新查询周边资源失败', {
              markerKey,
              error,
            })
          })
      }
    })
  }

  /** 同步范围圈独立矢量图层：store 变化时画/移/改圈几何 */
  const syncResourceCircles = () => {
    const circles = nearbyResourceLayerStore.circles
    if (!circles.length) {
      if (resourceCircleLayer) {
        const source = resourceCircleLayer.getSource()
        const feature = source?.getFeatureById(RESOURCE_CIRCLE_FEATURE_ID)
        if (feature) source?.removeFeature(feature)
      }
      return
    }
    if (resourceCircleDragging) return
    ensureResourceCircleLayer()
    if (!map || !resourceCircleLayer) return
    const source = resourceCircleLayer.getSource()
    if (!source) return
    const circle = circles[0]
    const center3857 = fromLonLat([circle.lng, circle.lat])
    const projectedRadius = groundMetersToMercator(circle.radiusMeters, circle.lat)
    const newGeom = new CircleGeom(center3857, projectedRadius)
    let feature = source.getFeatureById(RESOURCE_CIRCLE_FEATURE_ID) as Feature | undefined
    if (feature) {
      feature.setGeometry(newGeom)
    } else {
      feature = markRaw(new Feature({ geometry: newGeom }))
      feature.setId(RESOURCE_CIRCLE_FEATURE_ID)
      source.addFeature(feature)
    }
  }

  /** 按共享周边资源 store 范围圈并集，对消防栓/重点单位 WMS 图层统一应用/恢复 */
  const syncResourceLayersOverride = () => {
    NEARBY_RESOURCE_LAYER_NAMES.forEach((layerName) => syncOneResourceLayerOverride(layerName))
    syncResourceCircles()
  }

  const onResourceCirclesChange = () => {
    if (!active) return
    syncResourceLayersOverride()
  }

  /**
   * 主管队站以独立 zhu.png 图标上图：全量消防站图层填充时排除各业务方
   * 声明的主管 id，避免同一位置两个队站图标重叠。
   */
  const syncFireManagerStations = () => {
    if (!fireManager || !fireStations.value.length) return
    const excludedIds = new Set(stationLayerStore.primaryStationIds.map((id) => String(id).trim()))
    const visibleStations = fireStations.value.filter((station) => !excludedIds.has(String(station.id).trim()))
    fireManager.setStations?.(visibleStations)
  }

  /** 主图态口径：排除集合清空后须把全量队站还回消防站图层 */
  const restoreAllFireStations = () => {
    if (!fireManager || !fireStations.value.length) return
    fireManager.setStations?.([...fireStations.value])
  }

  const onPrimaryStationIdsChange = () => {
    if (!active) return
    syncFireManagerStations()
  }

  /** 共享队站加载完成后重同步主管排除（map.vue 的 loadFireStations 填充同一共享 ref） */
  const onFireStationsLoaded = () => {
    if (!active) return
    syncFireManagerStations()
    // 队站详情晚于路径规划到达时，重开一次已选队站弹窗补齐 WFS 字段
    const openId = featureClickQuery?.getOpenStationId()
    const openStation = routePreviewStations.value.find((station) => station.stationId === openId)
    if (openStation) showRouteStationPopup(openStation)
  }

  // =========================================================================
  // 警情定位点位 / 主管队站 watch 回调（原 L756-887；watch 注册推迟到 activate）
  // =========================================================================
  /** 画像地址变更点位：watch store.markers 数据 diff 后增量 upsert/remove */
  const onIncidentLocationMarkersChange = (next: Record<string, IncidentLocationMarker>) => {
    if (Object.values(next).some((entry) => entry.coordinateSource === 'slotChanges')) {
      clearActiveCallLocation()
    }
    if (!incidentLocationManager) return
    Object.values(next).forEach((entry) => {
      const old = renderedMarkers.get(entry.key)
      if (!old || old.lng !== entry.lng || old.lat !== entry.lat || old.version !== entry.version) {
        incidentLocationManager?.upsert(entry)
      }
    })
    renderedMarkers.forEach((_old, key) => {
      if (!(key in next)) incidentLocationManager?.remove(key)
    })
    renderedMarkers = new globalThis.Map(Object.values(next).map((entry) => [entry.key, entry]))
  }

  /** 按模拟调派门控刷新主管图层（zhu.png） */
  const syncPrimaryStationVisibility = () => {
    if (!primaryStationManager) return
    const items = Object.values(incidentLocationStore.primaryStations)
    primaryStationManager.setData(
      mockDispatchPrimaryGate ? items.filter((station) => mockDispatchPrimaryGate!.has(station.stationId)) : items,
    )
  }

  /** 模拟调派队站图标门控 */
  const applyMockDispatchStationIcons = (stationIds: string[]) => {
    const primaryIds = new Set(Object.values(incidentLocationStore.primaryStations).map((station) => station.stationId))
    const dispatchPrimaryIds = stationIds.filter((id) => primaryIds.has(id))
    const dispatchSupportIds = stationIds.filter((id) => !primaryIds.has(id))
    const store = useStationLayerStore()
    store.setPrimaryStations(MOCK_DISPATCH_STATION_OWNER, dispatchPrimaryIds)
    store.setStations(MOCK_DISPATCH_STATION_OWNER, dispatchSupportIds)
    mockDispatchPrimaryGate = new Set(dispatchPrimaryIds)
    syncPrimaryStationVisibility()
  }

  /** 退出模拟调派：清除图标门控，恢复非调派期队站图层规则 */
  const clearMockDispatchStationIcons = () => {
    mockDispatchPrimaryGate = null
    useStationLayerStore().clearOwner(MOCK_DISPATCH_STATION_OWNER)
    syncPrimaryStationVisibility()
  }

  /** 主管队站点位：watch store.primaryStations diff 后增量 upsert/remove */
  const onPrimaryStationsChange = (next: Record<string, IncidentPrimaryStation>) => {
    if (!primaryStationManager) return
    if (mockDispatchPrimaryGate) {
      primaryStationManager.setData(
        Object.values(next).filter((station) => mockDispatchPrimaryGate!.has(station.stationId)),
      )
      renderedPrimaryStations = new globalThis.Map(Object.values(next).map((station) => [station.key, station]))
      return
    }
    Object.values(next).forEach((station) => {
      const old = renderedPrimaryStations.get(station.key)
      if (
        !old ||
        old.lng !== station.lng ||
        old.lat !== station.lat ||
        old.stationId !== station.stationId ||
        old.version !== station.version
      ) {
        primaryStationManager?.upsert(station)
      }
    })
    renderedPrimaryStations.forEach((_old, key) => {
      if (!(key in next)) primaryStationManager?.remove(key)
    })
    renderedPrimaryStations = new globalThis.Map(Object.values(next).map((station) => [station.key, station]))
  }

  // 辖区渲染已禁用（store.zones 不再上图，与源 dispatchMap.vue 注释态一致）。

  // =========================================================================
  // 路径规划 + 模拟调派（原 L1054-1600）
  // =========================================================================
  // 解析动态配置（支持数组与对象），优先 data 字段
  const configList = Array.isArray(amapData) ? (amapData as any[]) : [amapData as any]
  const firstCfg = (configList[0] || {}) as any
  const regionCfg = firstCfg.data || firstCfg

  const amapKey = ref<string>('7405ae6dde247ee87be4e7d8021056f4')

  const ensureAmapKey = () => {
    if (amapKey.value) return amapKey.value
    const input = window.prompt('请输入高德 Web 服务 Key（用于行政区边界/路径规划）', '')
    if (!input) return ''
    amapKey.value = input.trim()
    localStorage.setItem('AMAP_WEBSERVICE_KEY', amapKey.value)
    return amapKey.value
  }

  /** 最近一次警情定位路径规划结果（TMC 路线 + 指标 + ETA） */
  let lastRoutePlanResults: AmapDrivingResult[] = []

  const routePreviewStations = ref<StationRouteAlternatives[]>([])
  const routePreviewLoading = ref(false)
  const routePreviewVisible = ref(false)
  let pendingRoutePlan: Promise<void> | null = null

  const getStationRouteInfo = (stationId: string) => {
    if (!routePreviewVisible.value) return null
    const station = routePreviewStations.value.find((item) => item.stationId === stationId)
    if (!station) return null
    const route = getSelectedRoute(station)
    return route
      ? {
          etaText: `${Math.ceil(route.etaSeconds / 60)} 分钟`,
          distanceText: `${(route.result.distanceMeters / 1000).toFixed(1)} km`,
        }
      : { etaText: '正在计算', distanceText: '正在计算' }
  }

  const showRouteStationPopup = (station: StationRouteAlternatives) => {
    fireManager?.hide?.()
    const details = fireStations.value.find((item) => String(item.id) === station.stationId)
    featureClickQuery?.showStation({
      id: station.stationId,
      name: details?.title ?? station.stationName,
      address: details?.address ?? '暂无地址',
      coordinate: olProj.fromLonLat(station.origin),
    })
  }

  const syncSelectedRoutePlan = () => {
    const selected = routePreviewStations.value
      .map(getSelectedRoute)
      .filter((route): route is RouteAlternative => !!route)
    lastRoutePlanResults = selected.map((route) => route.result)
  }

  const selectStationRoute = (stationId: string, routeId: string) => {
    if (!routePreviewVisible.value || routePreviewLoading.value) return
    const station = routePreviewStations.value.find((item) => item.stationId === stationId)
    if (!station?.alternatives.some((route) => route.id === routeId)) return
    station.selectedId = routeId
    routePreviewStations.value.forEach((item) => {
      item.manualSelected = item.stationId === stationId
    })
    if (!specialMapActive) syncSelectedRoutePlan()
    nav?.renderRouteAlternatives(routePreviewStations.value)
    showRouteStationPopup(station)
  }

  /** 地址更新后逐队站请求候选；旧地址的异步结果不得覆盖新地址 */
  const loadRoutePlan = async (req: IncidentLocationRoutePlanRequest) => {
    if (!nav || !map) return
    specialMapActive = false
    specialMapMock?.clear()
    resetRouteVideoPlayback()
    clearMockTrackingTimers()
    nav.stop()
    routePreviewStations.value = []
    routePreviewVisible.value = true
    routePreviewLoading.value = true
    lastRoutePlanResults = []
    const planner = nav
    const generation = routeVideoGeneration
    const stations =
      req.stations ??
      req.origins.map((coordinate, index) => ({
        id: `origin-${index}`,
        name: `队站 ${index + 1}`,
        coordinate,
      }))
    routePreviewStations.value = stations.map((station) => ({
      stationId: station.id,
      stationName: station.name,
      origin: station.coordinate,
      destination: req.destination,
      alternatives: [],
      selectedId: '',
    }))
    if (routePreviewStations.value[0]) showRouteStationPopup(routePreviewStations.value[0])
    try {
      const groups = await Promise.all(
        stations.map(async (station): Promise<StationRouteAlternatives> => {
          const group: StationRouteAlternatives = {
            stationId: station.id,
            stationName: station.name,
            origin: station.coordinate,
            destination: req.destination,
            alternatives: [],
            selectedId: '',
          }
          try {
            group.alternatives = await planner.fetchRouteAlternatives(station.coordinate, req.destination)
            group.selectedId = group.alternatives[0].id
          } catch (error) {
            group.error = '暂未获取到可用路线，请更新地址重试'
            console.warn('[address-updated] 队站候选路线查询失败', {
              stationId: station.id,
              error,
            })
          }
          return group
        }),
      )
      if (
        req.seq !== incidentLocationStore.routePlanRequest?.seq ||
        nav !== planner ||
        generation !== routeVideoGeneration
      )
        return
      routePreviewStations.value = groups
      syncSelectedRoutePlan()
      planner.renderRouteAlternatives(groups, true)
      if (groups[0]) showRouteStationPopup(groups[0])
    } finally {
      if (req.seq === incidentLocationStore.routePlanRequest?.seq && generation === routeVideoGeneration) {
        routePreviewLoading.value = false
      }
    }
  }

  const processRoutePlan = (req: IncidentLocationRoutePlanRequest) => {
    const task = loadRoutePlan(req).catch((error) => {
      console.warn('[address-updated] 路线预览失败', error)
    })
    pendingRoutePlan = task
    void task.finally(() => {
      if (pendingRoutePlan === task) pendingRoutePlan = null
    })
    return task
  }

  /** 路径规划请求 watch 回调（activate 时注册） */
  const onRoutePlanRequest = (req: IncidentLocationRoutePlanRequest | null) => {
    if (!nav || !map) return
    if (!req) {
      resetRouteVideoPlayback()
      nav.clearRoutes()
      routePreviewVisible.value = false
      routePreviewLoading.value = false
      routePreviewStations.value = []
      lastRoutePlanResults = []
      featureClickQuery?.close()
      return
    }
    void processRoutePlan(req)
  }

  /** 定位请求 watch 回调（activate 时注册） */
  const onFocusRequest = (req: IncidentLocationFocusRequest | null) => {
    if (!req || !incidentLocationManager || !map) return
    incidentLocationStore.consumeFocus(req.seq)
    focusMapView(map, req)
  }

  /** 模拟调派"先渲染路线、再定位起点、后启动跟踪"的分步计时器 */
  let mockTrackingTimers: number[] = []
  let routeVideoGeneration = 0

  const resetRouteVideoPlayback = () => {
    routeVideoGeneration += 1
    incidentVideoController?.close()
    nav?.clearRouteVideoCheckpoints()
    mockDispatchState = null
    clearMockDispatchStationIcons()
  }

  const playRouteVideoCheckpoint = (event: RouteVideoCheckpointEvent, generation: number) => {
    if (generation !== routeVideoGeneration || !nav || !incidentVideoController) return
    nav.setRouteVideoCheckpointStatus(event.checkpointIndex, 'playing')
    const durationMs = Math.max(5, event.secondsUntilArrival + 5) * 1000
    const checkpointKey = `${generation}:${event.checkpointIndex}`
    void incidentVideoController.playSingle(checkpointKey, event.lngLat[0], event.lngLat[1], durationMs).then(() => {
      if (generation === routeVideoGeneration) {
        nav?.setRouteVideoCheckpointStatus(event.checkpointIndex, 'played')
      }
    })
  }

  const clearMockTrackingTimers = () => {
    mockTrackingTimers.forEach((t) => window.clearTimeout(t))
    mockTrackingTimers = []
  }

  /** 活跃模拟调派状态 */
  let mockDispatchState: {
    generation: number
    destination: LngLat
    stationToRouteIndex: Map<string, number>
    started: boolean
    onStarted?: () => void
  } | null = null

  /** 解析模拟调派的警情终点 */
  const resolveMockDestination = (): LngLat | undefined => {
    const call = pendingCallLocationStore.getActive()
    const mockDestination: LngLat | undefined =
      call?.id === MOCK_CALL_LOCATION_ID ? [call.longitude, call.latitude] : undefined
    return (
      incidentLocationStore.routePlanRequest?.destination ??
      (lastRoutePlanResults[0]?.fullPath?.slice(-1)[0] as LngLat | undefined) ??
      mockDestination
    )
  }

  /** 按 zones 命中 → gis 队站表 → POI 兜底解析车辆起点坐标 */
  const resolveStationCoordinates = async (
    vehicles: SharedDispatchVehicleMock[],
    generation: number,
  ): Promise<Map<string, LngLat>> => {
    const zones = incidentLocationStore.zones
    const markerKey = incidentLocationStore.routePlanRequest?.markerKey
    const stationIdsByRouteIndex: string[] = []
    if (markerKey && zones[markerKey]) {
      stationIdsByRouteIndex.push(zones[markerKey].zoneId)
    }
    Object.keys(zones).forEach((key) => {
      if (markerKey && key.startsWith(`${markerKey}::`)) {
        stationIdsByRouteIndex.push(zones[key].zoneId)
      }
    })

    const stationStartCoords = new Map<string, LngLat>()
    routePreviewStations.value.forEach((station) => stationStartCoords.set(station.stationId, station.origin))
    stationIdsByRouteIndex.forEach((sid, idx) => {
      const start = lastRoutePlanResults[idx]?.fullPath?.[0]
      if (sid && start && !stationStartCoords.has(sid)) stationStartCoords.set(sid, start as LngLat)
    })

    const unmatchedStationIds = [
      ...new Set(
        vehicles.map((v) => String(v.stationId ?? '').trim()).filter((sid) => sid && !stationStartCoords.has(sid)),
      ),
    ]
    if (unmatchedStationIds.length) {
      const coordMap = await queryStationCoordinatesByIds(unmatchedStationIds)
      if (generation !== routeVideoGeneration) return stationStartCoords
      coordMap.forEach((coord, sid) => stationStartCoords.set(sid, coord))

      const key = ensureAmapKey()
      const unresolved = vehicles.filter((vehicle) => {
        const stationId = String(vehicle.stationId ?? '').trim()
        return stationId && !stationStartCoords.has(stationId) && vehicle.stationName?.trim()
      })
      if (key && unresolved.length) {
        await Promise.all(
          unresolved.map(async (vehicle) => {
            const stationId = String(vehicle.stationId).trim()
            if (stationStartCoords.has(stationId)) return
            try {
              const tips = await fetchInputTips({
                key,
                keywords: vehicle.stationName!.trim(),
                city: String(regionCfg?.adcode ?? '深圳市'),
                citylimit: true,
              })
              const stationName = vehicle.stationName!.trim()
              const matchedTip =
                tips.find((tip) => tip.name === stationName && tip.location) ??
                tips.find((tip) => tip.name.includes('消防') && tip.location) ??
                tips.find((tip) => tip.location)
              const coordinate = matchedTip?.location
              if (coordinate) stationStartCoords.set(stationId, coordinate)
            } catch (error) {
              console.warn('[dispatchMap] 队站名称坐标兜底查询失败', {
                stationId,
                stationName: vehicle.stationName,
                error,
              })
            }
          }),
        )
      }
    }
    return stationStartCoords
  }

  /** 二次调派：已有活跃模拟调派基础上增量处理车辆 */
  const handleSecondaryDispatch = (
    vehicles: SharedDispatchVehicleMock[],
    destination: LngLat,
    state: NonNullable<typeof mockDispatchState>,
  ) => {
    const doSecondary = async () => {
      if (!nav || state.generation !== routeVideoGeneration) return
      const planner = nav
      const sameStationCount = vehicles.filter((v) => {
        const sid = String(v.stationId ?? '').trim()
        return sid && state.stationToRouteIndex.has(sid)
      }).length

      const sameStationGroups = new Map<string, SharedDispatchVehicleMock[]>()
      vehicles.forEach((vehicle) => {
        const sid = String(vehicle.stationId ?? '').trim()
        if (!sid || !state.stationToRouteIndex.has(sid)) return
        const group = sameStationGroups.get(sid) ?? []
        group.push(vehicle)
        sameStationGroups.set(sid, group)
      })
      sameStationGroups.forEach((group, sid) => {
        const routeIndex = state.stationToRouteIndex.get(sid)
        if (routeIndex !== undefined) {
          planner.addVehicleToRoute(routeIndex, group)
        }
      })

      const newStationVehicles = vehicles.filter((v) => {
        const sid = String(v.stationId ?? '').trim()
        return sid && !state.stationToRouteIndex.has(sid)
      })

      if (newStationVehicles.length) {
        const stationStartCoords = await resolveStationCoordinates(newStationVehicles, state.generation)
        if (state.generation !== routeVideoGeneration || nav !== planner) return
        const uniqueNewStationIds = [
          ...new Set(
            newStationVehicles.map((v) => String(v.stationId!).trim()).filter((sid): sid is string => Boolean(sid)),
          ),
        ]
        for (const sid of uniqueNewStationIds) {
          if (!nav || state.generation !== routeVideoGeneration) return
          const origin = stationStartCoords.get(sid) ?? destination
          try {
            const selected = matchStationRoute(routePreviewStations.value, sid, destination)
            const { routeIndex } = await nav.addRoute(origin, destination, selected)
            state.stationToRouteIndex.set(sid, routeIndex)
            nav.setRouteVehicles(
              routeIndex,
              newStationVehicles.filter((vehicle) => String(vehicle.stationId ?? '').trim() === sid),
            )
          } catch (error) {
            console.warn('[dispatchMap] 二次调派新队站路径规划失败', {
              sid,
              error,
            })
          }
        }
        applyMockDispatchStationIcons([...state.stationToRouteIndex.keys()])
      }

      console.info('[dispatchMap] 二次调派处理完成', {
        sameStationCount,
        newStationCount: newStationVehicles.length,
        totalRouteCount: nav.getRouteCount(),
      })
    }

    if (state.started) {
      doSecondary()
    } else {
      const prev = state.onStarted
      state.onStarted = () => {
        prev?.()
        doSecondary()
      }
    }
  }

  const receiveMockDispatchVehicles = async (vehicles: SharedDispatchVehicleMock[]) => {
    if (!Array.isArray(vehicles) || !vehicles.length || !nav || !map) return
    const planner = nav
    const mapInstance = map
    const generation = routeVideoGeneration
    const isCurrent = (taskGeneration: number) =>
      nav === planner && map === mapInstance && taskGeneration === routeVideoGeneration

    while (pendingRoutePlan) {
      const task = pendingRoutePlan
      await task
      if (!isCurrent(generation)) return
      if (pendingRoutePlan === task) break
    }
    if (!isCurrent(generation)) return
    const destination = resolveMockDestination()
    if (!destination) {
      console.warn('[dispatchMap] 模拟调派缺少警情点坐标，跳过')
      return
    }

    routePreviewVisible.value = false
    featureClickQuery?.close()
    const isSecondary =
      !!mockDispatchState &&
      mockDispatchState.generation === routeVideoGeneration &&
      mockDispatchState.destination[0] === destination[0] &&
      mockDispatchState.destination[1] === destination[1]

    if (isSecondary && mockDispatchState) {
      handleSecondaryDispatch(vehicles, destination, mockDispatchState)
      return
    }

    if (routePreviewStations.value.length) {
      planner.renderRoutesOnly(
        routePreviewStations.value
          .map(getSelectedRoute)
          .filter((route): route is RouteAlternative => !!route)
          .map((route) => route.result),
        false,
      )
    }
    resetRouteVideoPlayback()
    const playbackGeneration = routeVideoGeneration

    const stationStartCoords = await resolveStationCoordinates(vehicles, playbackGeneration)
    if (!isCurrent(playbackGeneration)) return

    const uniqueStationIds = [
      ...new Set(
        vehicles
          .map((vehicle) => String(vehicle.stationId ?? '').trim())
          .filter((stationId): stationId is string => Boolean(stationId)),
      ),
    ]
    if (!uniqueStationIds.length) {
      console.warn('[dispatchMap] 模拟调派车辆均无 stationId，跳过路径规划')
      return
    }

    applyMockDispatchStationIcons(uniqueStationIds)

    const missing: string[] = []
    const origins: LngLat[] = uniqueStationIds.map((sid) => {
      const coord = stationStartCoords.get(sid)
      if (coord) return coord
      missing.push(sid)
      return [...destination] as LngLat
    })
    if (missing.length) {
      console.warn('[dispatchMap] 部分队站坐标缺失，以警情点为起点占位', missing)
    }
    console.info('[dispatchMap] 模拟调派车辆起点就绪', {
      vehicleCount: vehicles.length,
      uniqueStationCount: uniqueStationIds.length,
      originCount: origins.length,
      matchedCount: uniqueStationIds.length - missing.length,
    })

    let selectedRoutes: RouteAlternative[]
    try {
      selectedRoutes = await Promise.all(
        uniqueStationIds.map(
          async (sid, index) =>
            matchStationRoute(routePreviewStations.value, sid, destination) ??
            (await planner.fetchRouteAlternatives(origins[index], destination))[0],
        ),
      )
    } catch (error) {
      if (!isCurrent(playbackGeneration)) return
      console.warn('[dispatchMap] 调派路线获取失败', error)
      ElMessage.warning('部分调派队站暂无可用路线，请重试')
      clearMockDispatchStationIcons()
      if (isCurrent(playbackGeneration)) {
        routePreviewVisible.value = routePreviewStations.value.length > 0
        planner.renderRouteAlternatives(routePreviewStations.value)
      }
      return
    }
    if (!isCurrent(playbackGeneration)) return
    const results = selectedRoutes.map((route) => route.result)
    const metrics = selectedRoutes.map((route) => route.metrics)
    const etaSeconds = selectedRoutes.map((route) => route.etaSeconds)

    planner.renderRoutesOnly(results)
    planner.setRouteVideoCheckpoints(results, metrics, (event) => {
      if (isCurrent(playbackGeneration)) playRouteVideoCheckpoint(event, playbackGeneration)
    })

    mockDispatchState = {
      generation: playbackGeneration,
      destination,
      stationToRouteIndex: new Map(uniqueStationIds.map((sid, idx) => [sid, idx] as const)),
      started: false,
    }

    const stationLngLat = results[0]?.fullPath?.[0]

    const startTracking = () => {
      if (!isCurrent(playbackGeneration)) return
      planner.startRouteVehicleAnimation(results, metrics, etaSeconds, false)
      planner.setRouteVehicleGroups(
        uniqueStationIds.map((sid) => vehicles.filter((vehicle) => String(vehicle.stationId ?? '').trim() === sid)),
      )
      if (mockDispatchState && mockDispatchState.generation === playbackGeneration) {
        mockDispatchState.started = true
        const onStarted = mockDispatchState.onStarted
        mockDispatchState.onStarted = undefined
        onStarted?.()
      }
    }

    const schedule = (delay: number, fn: () => void) => {
      if (!isCurrent(playbackGeneration)) return
      const id = window.setTimeout(() => {
        mockTrackingTimers = mockTrackingTimers.filter((t) => t !== id)
        if (isCurrent(playbackGeneration)) fn()
      }, delay)
      mockTrackingTimers.push(id)
    }

    clearMockTrackingTimers()
    if (stationLngLat) {
      schedule(350, () => {
        mapInstance.getView().animate({
          center: olProj.fromLonLat(stationLngLat),
          zoom: 16,
          duration: 400,
        })
        schedule(450, startTracking)
      })
    } else {
      schedule(350, startTracking)
    }
  }

  // =========================================================================
  // 地址模拟 / 警情详情 / 弹窗（原 L1602-2001）
  // 注：多数入口由 B-6c 的模板驱动，本 composable 内暂无调用方，
  // 未使用者按源文件风格保留 @ts-expect-error TS6133 备份。
  // =========================================================================
  let mockSpecialMapUnsubscribers: Array<() => void> = []

  type TipItem = {
    id?: string
    name: string
    address?: string
    district?: string
    adcode?: string
    location?: [number, number]
  }

  const startText = ref('')
  const endText = ref('')
  const startTips = ref<TipItem[]>([])
  const endTips = ref<TipItem[]>([])
  const startCoord = ref<[number, number] | null>(null)
  const endCoord = ref<[number, number] | null>(null)
  const activeDropdown = ref<'start' | 'end' | null>(null)
  const isPlanning = ref(false)

  // @ts-expect-error TS6133: 模板功能已注释，变量保留备用
  const canStart = computed(() => !!endCoord.value && !isPlanning.value)

  /** 地图面板 DOM 锚点（B-6c 模板绑定）；composable 内无模板，恒为 null */
  const navPanelRef = ref<HTMLElement | null>(null)
  // @ts-expect-error TS6133: 弹窗 DOM 由 B-6c 模板绑定，变量保留备用
  const firePopupRef = ref<HTMLElement | null>(null)
  // @ts-expect-error TS6133: 弹窗 DOM 由 B-6c 模板绑定，变量保留备用
  const carPopupRef = ref<HTMLElement | null>(null)
  const firePopupVisible = ref(false)
  const fireSelected = ref<any | null>(null)
  // @ts-expect-error TS6133: 弹窗显隐由 B-6c 模板驱动，变量保留备用
  const carPopupVisible = ref(false)
  // @ts-expect-error TS6133: 弹窗数据由 B-6c 模板驱动，变量保留备用
  const carSelected = ref<CarItem | null>(null)

  /** 统一弹窗：警情规划(alarm)/今日灾情(jr)/警情定位(incident) 三类点位互斥 */
  type ActiveMapPopup =
    | { kind: 'alarm'; data: any }
    | { kind: 'jr'; data: JRAlarmData }
    | { kind: 'incident'; data: IncidentLocationMarker }
  // @ts-expect-error TS6133: 统一弹窗 DOM 由 B-6c 模板绑定，变量保留备用
  const alarmPopupRef = ref<HTMLElement | null>(null)
  const activeMapPopup = ref<ActiveMapPopup | null>(null)
  /** 警情规划数据：路径规划等其他链路直接使用，不随弹窗关闭清空 */
  const alarmData = ref<any>(null)

  /** 警情详情固定弹窗（居中 Modal，与小弹窗分离） */
  const incidentDetailVisible = ref(false)
  const incidentDetailData = ref<IncidentDetailData | null>(null)
  const incidentDetailLoading = ref(false)
  /** 请求序号：弹窗可连续切换警情打开，仅最新一次请求允许回写数据 */
  let incidentDetailRequestId = 0

  const formatTipText = (t: TipItem) => {
    const parts = [t.name, t.district, t.address].filter(Boolean)
    return parts.join(' ')
  }

  const debounce = <T extends (...args: any[]) => void>(fn: T, waitMs: number) => {
    let timer: number | null = null
    return (...args: Parameters<T>) => {
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => fn(...args), waitMs)
    }
  }

  const loadBeijingMaskIfReady = async () => {
    if (!nav || !amapKey.value) return
    try {
      await nav.loadMask((regionCfg?.boundaries as any) || [])
    } catch {
      return
    }
  }

  const queryTips = async (type: 'start' | 'end') => {
    if (!nav) return
    const key = ensureAmapKey()
    if (!key) return
    nav.setKey(key)
    await loadBeijingMaskIfReady()

    const keywords = (type === 'start' ? startText.value : endText.value).trim()
    if (!keywords) {
      if (type === 'start') startTips.value = []
      else endTips.value = []
      return
    }

    const tips = (await fetchInputTips({
      key,
      keywords,
      city: (regionCfg?.city as string) || '',
      citylimit: true,
    })) as TipItem[]

    const filtered = tips.filter((t) => t.location && Number.isFinite(t.location[0]) && Number.isFinite(t.location[1]))

    if (type === 'start') startTips.value = filtered
    else endTips.value = filtered
  }

  // @ts-expect-error TS6133: 模板功能已注释，变量保留备用
  const queryStartTips = debounce(() => queryTips('start'), 220)
  // @ts-expect-error TS6133: 模板功能已注释，变量保留备用
  const queryEndTips = debounce(() => queryTips('end'), 220)

  // @ts-expect-error TS6133: 模板功能已注释，变量保留备用
  const selectTip = (type: 'start' | 'end', tip: TipItem) => {
    if (!tip.location || !nav) return
    const text = formatTipText(tip)
    if (type === 'start') {
      startText.value = text
      startCoord.value = tip.location
      nav.setEndpoint('start', tip.location)
    } else {
      endText.value = text
      endCoord.value = tip.location
      nav.setEndpoint('end', tip.location)
    }
    activeDropdown.value = null
  }

  // @ts-expect-error TS6133: 模板功能已注释，变量保留备用
  const fetchDisasterSuggestions = async (queryString: string, cb: any): Promise<any> => {
    const q = (queryString || '').trim()
    if (!q) {
      cb([] as any)
      return
    }
    if (!nav) {
      cb([] as any)
      return
    }
    const key = ensureAmapKey()
    if (!key) {
      cb([] as any)
      return
    }
    nav.setKey(key)
    await loadBeijingMaskIfReady()

    try {
      const tips = (await fetchInputTips({
        key,
        keywords: q,
        city: (regionCfg?.city as string) || '',
        citylimit: true,
      })) as TipItem[]

      const items = tips
        .filter((t) => t.location && Number.isFinite(t.location[0]) && Number.isFinite(t.location[1]))
        .map((t) => ({
          ...t,
          value: formatTipText(t),
        }))

      cb(items as any)
    } catch {
      cb([] as any)
    }
  }

  // @ts-expect-error TS6133: 模板功能已注释，变量保留备用
  const onDisasterSelect = (item: any) => {
    const loc = item?.location as [number, number] | undefined
    if (!loc) return
    endText.value = item?.value || formatTipText(item)
    endCoord.value = loc
    if (map) {
      map.getView().animate({
        center: olProj.fromLonLat(loc),
        duration: 300,
      })
      nav?.setEndpoint('end', loc)
    }
  }

  // @ts-expect-error TS6133: 模板功能已注释，变量保留备用
  const pickOnMap = async (type: 'start' | 'end') => {
    if (!nav) return
    const key = ensureAmapKey()
    if (!key) return
    nav.setKey(key)
    await loadBeijingMaskIfReady()

    const picked = await nav.pickAddressPoint(type)
    if (!picked) return

    if (type === 'start') {
      startText.value = picked.address
      startCoord.value = picked.lngLat
    } else {
      endText.value = picked.address
      endCoord.value = picked.lngLat
    }
    activeDropdown.value = null
  }

  // @ts-expect-error TS6133: 模板功能已注释，变量保留备用
  const startSimulate = async (orgs?: any[], d?: any) => {
    if (!nav || !endCoord.value) return
    const key = ensureAmapKey()
    if (!key) return
    nav.setKey(key)
    await loadBeijingMaskIfReady()

    isPlanning.value = true
    try {
      let nearests: any[] = []
      let nearest = {} as any
      if (orgs && orgs.length) {
        nearests = orgs
      } else {
        nearest = await getNearestFireStation(endCoord.value)
      }

      const starts: [number, number][] = nearests.length
        ? nearests
            .filter((org) => Number.isFinite(org?.gisX) && Number.isFinite(org?.gisY))
            .map((org) => [org.gisX, org.gisY])
        : nearest?.station
          ? [[nearest.station.lng, nearest.station.lat]]
          : []

      if (!starts.length) {
        ElMessage.warning('未找到可用的消防站坐标')
        return
      }

      startCoord.value = starts[0]
      startText.value = nearests.length
        ? nearests.map((org) => org.orgName || org.title).join(', ')
        : (nearest.station as any).title

      starts.forEach((start, index) => {
        if (index === 0) {
          nav!.setEndpoint('start', start)
        }
      })

      nav.setEndpoint('alarm', endCoord.value, {
        alarmData: alarmData.value || undefined,
      })
      alarmOverlayManager?.showAtAlarm()

      if (starts.length > 1) {
        await nav.planAndStartMulti(starts, endCoord.value, d)
      } else {
        await nav.planAndStart(starts[0], endCoord.value, d)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '路径规划失败'
      ElMessage.error(msg)
    } finally {
      isPlanning.value = false
    }
  }

  /** 清空导航相关：重置路线视频 + 端点 + 地址模拟 refs（mock render 调用） */
  const clearNav = () => {
    resetRouteVideoPlayback()
    nav?.stop()
    nav?.clearEndpoints()
    closeAlarmPopup()
    EventBus.emit('panelClose')
    startText.value = ''
    endText.value = ''
    startTips.value = []
    endTips.value = []
    startCoord.value = null
    endCoord.value = null
    activeDropdown.value = null
  }

  const handleDocumentClick = (e: MouseEvent) => {
    const el = navPanelRef.value
    if (!el) return
    if (!el.contains(e.target as Node)) {
      activeDropdown.value = null
    }
  }

  // @ts-expect-error TS6133: 弹窗关闭由 B-6c 模板按钮触发，函数保留备用
  const closeFirePopup = () => {
    firePopupVisible.value = false
    fireSelected.value = null
    if (fireManager) fireManager.hide?.()
  }

  const closeAlarmPopup = () => {
    activeMapPopup.value = null
    alarmData.value = null
    alarmOverlayManager?.hide()
  }

  /** 从松散业务对象中按候选字段名取第一个非空值 */
  const pickField = (data: Record<string, any> | null | undefined, keys: string[]): string | null => {
    for (const key of keys) {
      const value = data?.[key]
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return String(value)
      }
    }
    return null
  }

  /** 时间值格式化为 YYYY-MM-DD HH:mm:ss，空值/非法值返回 null */
  const formatDetailTime = (value: unknown): string | null => {
    if (value === null || value === undefined || value === '') return null
    const text = dayjs(value as string | number | Date)
    return text.isValid() ? text.format('YYYY-MM-DD HH:mm:ss') : null
  }

  /** 将当前命中点位归一化为警情详情字段（缺失字段留空） */
  const buildIncidentDetailData = (popup: ActiveMapPopup): IncidentDetailData => {
    if (popup.kind === 'jr') {
      const d = popup.data
      return {
        alarmOrderNo: d.incidentId || null,
        receiveTime: formatDetailTime(d.createdAt),
        disasterGrade: d.disasterGradeLabel ?? d.disasterGrade ?? null,
        keyUnitName: d.keyUnit ?? null,
        disasterAddress: d.disasterAddress ?? null,
        burningMaterial: d.burningMaterial ?? null,
        disasterType: d.disasterTypeLabel ?? d.disasterType ?? null,
      }
    }
    if (popup.kind === 'alarm') {
      const d = popup.data as Record<string, any> | null
      return {
        alarmOrderNo: pickField(d, ['alarmOrderNo', 'orderNo', 'incidentId', 'inquiryId']),
        callInTime: formatDetailTime(pickField(d, ['callInTime', 'callTime', 'alarmTime'])),
        accessType: pickField(d, ['accessType', 'accessTypeLabel']),
        callerPhone: pickField(d, ['callerPhone', 'callerNumber', 'phone']),
        callerName: pickField(d, ['callerName', 'ownerName']),
        installAddress: pickField(d, ['installAddress', 'installedAddress']),
        seatNo: pickField(d, ['seatNo', 'seatId']),
        receiveTime: formatDetailTime(pickField(d, ['receiveTime', 'createdAt'])),
        disasterGrade: pickField(d, ['disasterGradeLabel', 'disasterGrade']),
        keyUnitName: pickField(d, ['keyUnitName', 'keyUnit']),
        supplementary: pickField(d, ['supplementary', 'isSupplementary']),
        disasterAddress: pickField(d, ['disasterAddress', 'address']),
        burningMaterial: pickField(d, ['burningMaterial']),
        alarmFlag: pickField(d, ['alarmFlag', 'alarmFlagLabel']),
        smokeSituation: pickField(d, ['smokeSituation', 'smoke']),
        trappedCount: pickField(d, ['trappedCount', 'trappedPeopleCount']),
        administrativeDivision: pickField(d, ['administrativeDivision', 'district']),
        disasterType: pickField(d, ['disasterTypeLabel', 'disasterType', 'alarmType']),
      }
    }
    return {
      disasterAddress: popup.data.address ?? null,
    }
  }

  /** 提取当前弹窗点位的警情 ID；取不到时详情弹窗仅展示本地快照 */
  const pickPopupIncidentId = (popup: ActiveMapPopup): string | null => {
    if (popup.kind === 'jr') return popup.data.incidentId || null
    if (popup.kind === 'alarm') {
      return pickField(popup.data, ['incidentId', 'inquiryId', 'orderNo'])
    }
    return popup.data.incidentId || null
  }

  /**
   * 点击小弹窗"警情详情"按钮：先用本地快照打开弹窗，再拉取详情接口覆盖。
   * （B-6c 模板挂载；composable 内暂无调用方，保留备用）
   */
  // @ts-expect-error TS6133: 详情弹窗由 B-6c 模板按钮触发，函数保留备用
  const openIncidentDetail = () => {
    if (!activeMapPopup.value) return
    const incidentId = pickPopupIncidentId(activeMapPopup.value)
    incidentDetailData.value = buildIncidentDetailData(activeMapPopup.value)
    incidentDetailVisible.value = true
    if (!incidentId?.trim()) return
    const requestId = ++incidentDetailRequestId
    incidentDetailLoading.value = true
    fetchIncidentDetail<IncidentDetailResponseData>(incidentId)
      .then((detail) => {
        if (requestId !== incidentDetailRequestId) return
        incidentDetailData.value = toIncidentDetailData(detail)
      })
      .catch((error) => {
        console.warn('[incident-detail] 拉取警情详情失败', {
          incidentId,
          error,
        })
        if (requestId === incidentDetailRequestId) {
          ElMessage.error('警情详情获取失败，当前展示点位已知信息')
        }
      })
      .finally(() => {
        if (requestId === incidentDetailRequestId) incidentDetailLoading.value = false
      })
  }

  // =========================================================================
  // 车辆历史轨迹（原 L2505-2704；watch 注册推迟到 activate）
  // =========================================================================
  const vehicleTrackStore = useVehicleTrackStore()
  const vehicleTrackLogger = createLogger('vehicle-track')
  let vehicleTrackRenderer: VehicleTrackRenderer | null = null
  let vehicleTrackUnsubscribe: (() => void) | null = null
  /** 查询序号，用于丢弃过期响应（警情快速切换时） */
  let vehicleTrackRequestSeq = 0

  /** 共享态 currentAlarm.lifecycleStage（受理席写入，用于识别 closed 的历史轨迹链路） */
  const readCurrentLifecycleStage = () => {
    const value = userStore.currentAlarm?.lifecycleStage
    return typeof value === 'string' ? value.trim().toLowerCase() : ''
  }

  const ensureVehicleTrackRenderer = () => {
    if (!map) return null
    if (!vehicleTrackRenderer) vehicleTrackRenderer = createVehicleTrackRenderer(map)
    return vehicleTrackRenderer
  }

  /**
   * 将 vehicleTrackStore 的轨迹数据渲染到 OpenLayers 图层。
   * 双轨制：trackEntries（多车新模式）非空时走 renderMulti + setCursorAll，
   * 否则回退到单车旧模式 points → render；panel 隐藏或数据空时 clear。
   * @param fit 渲染时是否让地图自动缩放定位到轨迹范围
   */
  const syncVehicleTrackLayer = (fit: boolean) => {
    const renderer = ensureVehicleTrackRenderer()
    if (!renderer) return
    if (!vehicleTrackStore.panelVisible) {
      renderer.clear()
      return
    }

    // 多车新模式：trackEntries 非空时优先用 renderMulti
    if (vehicleTrackStore.trackEntries.size > 0) {
      const entries = [...vehicleTrackStore.trackEntries.values()]
      if (!entries.length) {
        renderer.clear()
        return
      }
      // 以 activeRoute 下的轨迹时间跨度为准 fit；所有分组 setCursorAll 同步推进
      renderer.renderMulti(entries, { fit })
      renderer.setCursorAll(vehicleTrackStore.cursor)
      return
    }

    // 单车旧模式：points 直接 render
    if (!vehicleTrackStore.points.length) {
      renderer.clear()
      return
    }
    renderer.render(vehicleTrackStore.points, vehicleTrackStore.cursor, {
      fit,
    })
  }

  /**
   * 终态警情上图前清理原有警情产物：路径规划、路线预览、模拟调派状态、
   * 警情点位与主管队站/周边资源声明。终态地图只保留车辆历史轨迹。
   * 内部调用链 100% 保持。
   */
  const clearOriginalIncidentArtifacts = () => {
    resetRouteVideoPlayback()
    clearMockTrackingTimers()
    nav?.stop()
    nav?.clearRoutes()
    routePreviewVisible.value = false
    routePreviewLoading.value = false
    routePreviewStations.value = []
    lastRoutePlanResults = []
    pendingRoutePlan = null
    featureClickQuery?.close()
    incidentLocationStore.clearAll()
  }

  /**
   * 多车辆多路线场景：按警情查询出动车辆 → 按 stationId 分组 → 每组独立查轨迹 → 并行上图。
   * 新接口整体失败（未上 dev / 上游不可用）时自动降级为单车旧逻辑。
   */
  const loadVehicleTrack = async (incidentId: string, options?: { openPanel?: boolean }) => {
    const seq = ++vehicleTrackRequestSeq
    vehicleTrackStore.loading = true
    try {
      // 1. 查询出动车辆列表
      const [turnoutResult] = await Promise.allSettled([
        queryIncidentTurnoutVehicles(incidentId),
      ])

      if (seq !== vehicleTrackRequestSeq) return

      // 2. 新接口整体失败 → 降级到单车旧逻辑
      if (turnoutResult.status === 'rejected') {
        vehicleTrackLogger.warn('出动车辆接口失败，降级为单车旧逻辑', {
          incidentId,
          error: (turnoutResult.reason as Error)?.message,
        })
        await loadVehicleTrackFallbackSingle(incidentId, options)
        return
      }

      const turnoutData = turnoutResult.value

      const vehicles = turnoutData.vehicles
      if (vehicles === null) {
        vehicleTrackStore.markUnavailable(incidentId)
        vehicleTrackLogger.info('车辆数据暂不可用（后端依赖服务出错）', { incidentId })
        ElMessage.warning('车辆信息暂不可用，请稍后重试')
        return
      }
      if (!vehicles.length) {
        vehicleTrackStore.markUnavailable(incidentId)
        vehicleTrackLogger.info('暂无出动车辆', { incidentId })
        ElMessage.warning('该警情暂无出动车辆，请重新选择')
        return
      }

      // 3. 按 stationId 分组（同 stationId → 同一路线；不同 stationId → 不同路线）
      const groups = groupTurnoutVehiclesByStation(vehicles)
      vehicleTrackLogger.info('出动车辆路线分组', {
        incidentId,
        groups: groups.map((g) => ({
          key: g.key,
          stationName: g.stationName,
          vehicleCount: g.vehicles.length,
        })),
      })

      // 4. 并行查询每辆车的历史轨迹（Promise.allSettled：个别失败不阻塞整体）
      const vehicleEntries: VehicleTrackEntry[] = []
      const settled = await Promise.allSettled(
        vehicles.map(async (vehicle) => {
          const { beginTime, endTime } = supplementTrackTimeFromDetail(vehicle)
          const points = await queryCarHistoryTrack(vehicle.vehicleId, { beginTime, endTime })
          return { vehicle, points }
        }),
      )

      for (let i = 0; i < settled.length; i += 1) {
        const result = settled[i]
        if (result.status === 'rejected') {
          vehicleTrackLogger.warn('单车轨迹查询失败，跳过', {
            incidentId,
            vehicleId: vehicles[i]?.vehicleId,
            error: (result.reason as Error)?.message,
          })
          continue
        }
        const { vehicle, points } = result.value
        const filtered = (Array.isArray(points) ? points : [])
          .filter((p) => Number.isFinite(p?.longitude) && Number.isFinite(p?.latitude))
          .sort((a, b) => String(a.gpsTime).localeCompare(String(b.gpsTime)))
        if (filtered.length < 2) continue

        // 找到该车所属路线分组，取路线颜色
        const group = groups.find((g) =>
          g.vehicles.some((v) => v.vehicleId === vehicle.vehicleId),
        )
        const routeKey = group?.key ?? 'unknown-station'
        const routeColor = group?.color ?? '#1D9BF0'

        vehicleEntries.push({
          trackId: `${routeKey}:${vehicle.vehicleId}`,
          routeKey,
          routeColor,
          vehicleId: vehicle.vehicleId,
          plateNumber: vehicle.plateNumber,
          startTime: vehicle.startTime,
          endTime: vehicle.endTime,
          stationId: vehicle.stationId,
          stationName: vehicle.stationName,
          points: filtered,
        })
      }

      if (seq !== vehicleTrackRequestSeq) return

      vehicleTrackLogger.info('多车历史轨迹查询完成', {
        incidentId,
        totalVehicles: vehicles.length,
        successCount: vehicleEntries.length,
      })

      if (!vehicleEntries.length) {
        vehicleTrackStore.markUnavailable(incidentId)
        vehicleTrackLogger.info('全部车辆轨迹查空', { incidentId })
        ElMessage.warning('未查询到历史轨迹数据，请重新选择')
        return
      }

      // 5. 过滤掉无轨迹的车辆后，只保留有车辆的路线分组
      const vehicleIdsWithTrack = new Set(vehicleEntries.map((e) => e.vehicleId))
      const activeGroups = groups
        .map((g) => ({
          ...g,
          vehicles: g.vehicles.filter((v) => vehicleIdsWithTrack.has(v.vehicleId)),
        }))
        .filter((g) => g.vehicles.length > 0)

      vehicleTrackStore.setMultiTracks(vehicleEntries, activeGroups)
      vehicleTrackStore.incidentId = incidentId

      // 打开面板并立即渲染（syncVehicleTrackLayer 会被 watch panelVisible 触发）
      if (options?.openPanel) {
        nextTick(() => {
          vehicleTrackStore.panelVisible = true
          syncVehicleTrackLayer(true)
        })
      } else {
        // 不打开面板时也要确保按钮显示状态正确
        vehicleTrackStore.buttonVisible = true
      }
    } catch (error) {
      if (seq !== vehicleTrackRequestSeq) return
      vehicleTrackLogger.error('多车历史轨迹查询失败，降级为单车旧逻辑', error)
      try {
        await loadVehicleTrackFallbackSingle(incidentId, options)
      } catch (fallbackError) {
        vehicleTrackLogger.error('降级单车逻辑也失败', fallbackError)
        vehicleTrackStore.markUnavailable(incidentId)
        ElMessage.warning('未查询到历史轨迹数据，请重新选择')
      }
    }
  }

  /**
   * 降级单车旧逻辑：取最新批次第一辆车 + 写死时间范围。
   * 仅在新接口整体失败（未上 dev / 上游不可用）时作为兜底。
   */
  const loadVehicleTrackFallbackSingle = async (
    incidentId: string,
    options?: { openPanel?: boolean },
  ) => {
    const detail = await fetchIncidentDetail<IncidentDetailResponseData>(incidentId)
    const vehicleId = extractLatestBatchFirstVehicleId(detail)
    if (!vehicleId) {
      vehicleTrackStore.markUnavailable(incidentId)
      ElMessage.warning('该警情暂无调派车辆，请重新选择')
      return
    }
    const result = await queryCarHistoryTrack(vehicleId)
    const points = (Array.isArray(result) ? result : [])
      .filter((point) => Number.isFinite(point?.longitude) && Number.isFinite(point?.latitude))
      .sort((a, b) => String(a.gpsTime).localeCompare(String(b.gpsTime)))
    if (!points.length) {
      vehicleTrackStore.markUnavailable(incidentId)
      ElMessage.warning('未查询到历史轨迹数据，请重新选择')
      return
    }
    vehicleTrackStore.setTrack(points, vehicleId, incidentId, options)
  }

  /** 终态警情：清理原有警情产物并切换到历史轨迹，重复触发时沿用已加载轨迹 */
  const beginVehicleTrack = (incidentId: string) => {
    const currentIncidentId = String(userStore.currentAlarm?.incidentId ?? '').trim()
    if (!currentIncidentId || currentIncidentId === incidentId) clearOriginalIncidentArtifacts()
    if (vehicleTrackStore.incidentId === incidentId && vehicleTrackStore.points.length) {
      vehicleTrackLogger.info('同一警情终态重复到达，沿用已有轨迹', {
        incidentId,
      })
      return
    }
    if (vehicleTrackStore.incidentId === incidentId && vehicleTrackStore.loading) return
    vehicleTrackStore.markUnavailable(incidentId)
    void loadVehicleTrack(incidentId, { openPanel: true })
  }

  /** 警情状态变更：终态转历史轨迹，非终态换警情时清空上一条轨迹 */
  const handleAlarmStateChanged = (envelope: { data?: unknown }) => {
    const data = envelope?.data as { incidentId?: string; newState?: string } | undefined
    vehicleTrackLogger.info('收到 ALARM_INCIDENT/STATE_CHANGED', data)
    const incidentId = String(data?.incidentId ?? '').trim()
    const newState = String(data?.newState ?? '')
      .trim()
      .toUpperCase()
    if (!incidentId) return
    if (!isTerminalIncidentState(newState)) {
      if (vehicleTrackStore.terminalIncidentId && vehicleTrackStore.terminalIncidentId !== incidentId)
        vehicleTrackStore.clearTerminal()
      if (vehicleTrackStore.incidentId && vehicleTrackStore.incidentId !== incidentId) {
        vehicleTrackRequestSeq += 1
        vehicleTrackStore.reset()
        vehicleTrackRenderer?.clear()
      }
      return
    }
    vehicleTrackStore.markTerminal(incidentId, newState)
    beginVehicleTrack(incidentId)
  }

  /** 无轨迹时点击按钮：按当前警情重新查询，成功后自动打开面板 */
  const onVehicleTrackReload = () => {
    const incidentId = vehicleTrackStore.incidentId
    if (!incidentId) return
    vehicleTrackLogger.info('按钮点击重新查询', { incidentId })
    void loadVehicleTrack(incidentId, { openPanel: true })
  }

  const onVehicleTrackPanelVisible = (visible: boolean) => {
    if (!visible) {
      vehicleTrackRenderer?.clear()
      return
    }
    syncVehicleTrackLayer(true)
  }

  const onVehicleTrackCursor = (cursor: number) => {
    if (!vehicleTrackStore.panelVisible) return
    vehicleTrackRenderer?.setCursor(cursor)
  }

  /** 共享态 currentAlarm 变为 closed（可能没有 WS 终态消息）：同步终态标记 */
  const onLifecycleStageChange = (key: string) => {
    const [incidentId, lifecycleStage] = JSON.parse(key) as [string, string]
    if (!incidentId) return
    const staleTrackIds = [
      String(vehicleTrackStore.terminalIncidentId ?? '').trim(),
      String(vehicleTrackStore.incidentId ?? '').trim(),
    ].filter(Boolean)
    if (staleTrackIds.some((id) => id !== incidentId)) {
      vehicleTrackRequestSeq += 1
      vehicleTrackStore.clearTerminal()
      vehicleTrackStore.reset()
    }
    if (lifecycleStage === 'closed') {
      vehicleTrackStore.markTerminal(incidentId, lifecycleStage)
      beginVehicleTrack(incidentId)
      return
    }
    if (
      !lifecycleStage &&
      vehicleTrackStore.terminalIncidentId === incidentId &&
      vehicleTrackStore.terminalState === 'CLOSED'
    ) {
      vehicleTrackRequestSeq += 1
      vehicleTrackStore.clearTerminal()
      vehicleTrackStore.reset()
    }
  }

  // =========================================================================
  // 生命周期（activate / deactivate / dispose）
  // =========================================================================
  /** 当前激活期创建的 watch 停止器（deactivate 时统一 stop） */
  let stoppedWatchers: Array<() => void> = []
  /** 文档级 click 监听是否已注册 */
  let documentClickBound = false
  /** 调派 attachMap(kind:'dispatch') 的 detacher */
  let dispatchDetach: (() => void) | null = null

  const registerWatcher = (stopFn: () => void) => {
    stoppedWatchers.push(stopFn)
  }

  /** 挂起调派点位/主管队站图层，并把 store 现状上图 */
  const mountPointLayerManagers = () => {
    if (!map) return
    incidentLocationManager = mountPointLayer<IncidentLocationMarker>({
      map,
      items: Object.values(incidentLocationStore.markers),
      visible: true,
      className: INCIDENT_LOCATION_LAYER_CLASS,
      zIndex: INCIDENT_LOCATION_LAYER_ZINDEX,
      keyGetter: (entry) => entry.key,
      coordinateGetter: (entry) => [entry.lng, entry.lat],
      styleGetter: () => getStyle('alarm', { iconSrc: MAP_ICON_SRC.alarm, scale: 0.9 }),
    })
    renderedMarkers = new globalThis.Map(
      Object.values(incidentLocationStore.markers).map((entry) => [entry.key, entry]),
    )

    primaryStationManager = mountPointLayer<IncidentPrimaryStation>({
      map,
      items: Object.values(incidentLocationStore.primaryStations),
      visible: true,
      className: INCIDENT_PRIMARY_STATION_LAYER_CLASS,
      zIndex: MAP_LAYER_Z_INDEX.incident,
      keyGetter: (station) => station.key,
      coordinateGetter: (station) => [station.lng, station.lat],
      styleGetter: () =>
        getStyle('icon', {
          iconSrc: MAP_ICON_SRC.primaryStation,
          scale: 0.9,
          anchor: [0.5, 0.5],
        }),
    })
    renderedPrimaryStations = new globalThis.Map(
      Object.values(incidentLocationStore.primaryStations).map((station) => [station.key, station]),
    )

    // 刷新恢复：持久化点位已上图，异步重建辖区面/队站过滤/路径规划派生数据
    incidentLocationStore.restoreOnMapMount()
  }

  /** onMounted 终态回放：共享态/持久化标记判 closed 后直接回放历史轨迹 */
  const replayTerminalOnActivate = () => {
    const sharedIncidentId = String(userStore.currentAlarm?.incidentId ?? '').trim()
    const sharedLifecycleStage = readCurrentLifecycleStage()
    const staleTrackIds = [
      String(vehicleTrackStore.terminalIncidentId ?? '').trim(),
      String(vehicleTrackStore.incidentId ?? '').trim(),
    ].filter(Boolean)
    if (sharedIncidentId && staleTrackIds.some((id) => id !== sharedIncidentId)) {
      vehicleTrackStore.clearTerminal()
      vehicleTrackStore.reset()
    }
    if (sharedIncidentId && sharedLifecycleStage === 'closed') {
      vehicleTrackStore.markTerminal(sharedIncidentId, sharedLifecycleStage)
      beginVehicleTrack(sharedIncidentId)
      return
    }
    if (
      sharedIncidentId &&
      !sharedLifecycleStage &&
      vehicleTrackStore.terminalIncidentId === sharedIncidentId &&
      vehicleTrackStore.terminalState === 'CLOSED'
    ) {
      vehicleTrackStore.clearTerminal()
      vehicleTrackStore.reset()
    }
    const terminalIncidentId = String(vehicleTrackStore.terminalIncidentId ?? '').trim()
    if (!terminalIncidentId || !isTerminalIncidentState(vehicleTrackStore.terminalState)) return
    clearOriginalIncidentArtifacts()
    vehicleTrackStore.markUnavailable(terminalIncidentId)
    void loadVehicleTrack(terminalIncidentId, { openPanel: true })
  }

  /** 激活：variant→dispatch 时调用一次（防重入） */
  const activate = () => {
    if (active) return
    active = true

    // B-1/B-2 独立设施：此刻由 map.vue 的 attachDispatchBusiness() 已就绪，取句柄
    const business = getDispatchBusiness()
    incidentVideoController = business?.incidentVideoController ?? null
    specialMapMock = business?.specialMapMock ?? null
    incidentRelocate = business?.incidentRelocate ?? null
    callLocationController = business?.callLocationController ?? null
    callLocationGenericController = business?.callLocationGenericController ?? null

    mountPointLayerManagers()

    // 调派专属 FeatureClickQuery（带 getStationRouteInfo），activate 挂 singleclick
    featureClickQuery = new FeatureClickQuery(map, getStationRouteInfo)
    featureClickQuery.activate()

    // 消费地图挂载前积压的路径规划 / 定位请求
    const pendingRoute = incidentLocationStore.routePlanRequest
    if (pendingRoute) void processRoutePlan(pendingRoute)
    const pendingFocus = incidentLocationStore.focusRequest
    if (pendingFocus) {
      incidentLocationStore.consumeFocus(pendingFocus.seq)
      focusMapView(map, pendingFocus)
    }

    // 按共享 store 现状对 WMS 消防站/周边资源图层补做 CQL 过滤
    syncStationLayerOverride()
    syncResourceLayersOverride()

    // 终态回放（closed 警情直接走历史轨迹）
    replayTerminalOnActivate()

    // ---- 注册全部 watch（deactivate 时统一 stop） ----
    registerWatcher(
      watch(
        () => [...stationLayerStore.selectedStationIds, ...stationLayerStore.primaryStationIds],
        onStationLayerChange,
      ),
    )
    registerWatcher(
      watch(
        () =>
          nearbyResourceLayerStore.circles
            .map((circle) => `${circle.lng},${circle.lat},${circle.radiusMeters}`)
            .join('|'),
        onResourceCirclesChange,
      ),
    )
    registerWatcher(watch(() => [...stationLayerStore.primaryStationIds], onPrimaryStationIdsChange))
    registerWatcher(
      watch(() => fireStations.value, onFireStationsLoaded, {
        immediate: true,
      }),
    )
    registerWatcher(watch(() => ({ ...incidentLocationStore.markers }), onIncidentLocationMarkersChange))
    registerWatcher(watch(() => ({ ...incidentLocationStore.primaryStations }), onPrimaryStationsChange))
    registerWatcher(watch(() => incidentLocationStore.routePlanRequest, onRoutePlanRequest))
    registerWatcher(watch(() => incidentLocationStore.focusRequest, onFocusRequest))
    registerWatcher(watch(() => vehicleTrackStore.reloadToken, onVehicleTrackReload))
    registerWatcher(watch(() => vehicleTrackStore.panelVisible, onVehicleTrackPanelVisible))
    registerWatcher(watch(() => vehicleTrackStore.cursor, onVehicleTrackCursor))
    registerWatcher(
      watch(
        () => JSON.stringify([String(userStore.currentAlarm?.incidentId ?? '').trim(), readCurrentLifecycleStage()]),
        onLifecycleStageChange,
        { flush: 'sync' },
      ),
    )

    // ---- 文档级 click（面板下拉收起） ----
    document.addEventListener('click', handleDocumentClick, true)
    documentClickBound = true

    // ---- 受理席警情二次定位（WS 订阅） ----
    mockSpecialMapUnsubscribers.push(
      messageStore.subscribe(MESSAGE_EVENT_KEY.MOCK_INCIDENT_RELOCATE, (envelope) => {
        const d = envelope.data as { incidentId?: string; ownerId?: string; requestId?: string } | undefined
        if (!d?.incidentId || !incidentRelocate) return
        const token = d.ownerId && d.requestId ? { ownerId: d.ownerId, requestId: d.requestId } : undefined
        incidentRelocate.start(d.incidentId, token)
      }),
    )

    // ---- 车辆历史轨迹终态消息（WS 订阅） ----
    vehicleTrackUnsubscribe = messageStore.subscribe(MESSAGE_EVENT_KEY.ALARM_INCIDENT_STATE_CHANGED, (envelope) =>
      handleAlarmStateChanged(envelope as { data?: unknown }),
    )

    // ---- 调派 business message 端口（mock handlers，与 dispatchMap.vue 原逻辑一致） ----
    const businessRuntime = getBusinessMessageRuntime()
    const attachment = createBusinessMapPort(callLocationGenericController!)
    dispatchDetach = businessRuntime.attachMap(attachment.port, {
      kind: 'dispatch',
      dispose: attachment.dispose,
      mock: {
        render: () => {
          mockMapGeneration += 1
          specialMapActive = true
          lastRoutePlanResults = []
          callLocationController?.clearLocateCalls()
          incidentLocationStore.clearAll()
          clearNav()
          carManager?.setVisible(false)
          fireManager?.setVisible(false)
          incidentLocationManager?.setVisible(false)
          primaryStationManager?.setVisible(false)
          specialMapMock?.clear()
          routePreviewStations.value = []
          routePreviewVisible.value = false
        },
        disasterSite: async () => {
          const owner = specialMapMock
          const generation = mockMapGeneration
          if (!owner) return
          callLocationController?.clearLocateCalls()
          const stations = await owner.render()
          if (owner !== specialMapMock || generation !== mockMapGeneration) return
          routePreviewStations.value = stations
          routePreviewLoading.value = false
          routePreviewVisible.value = true
        },
        simulate: async () => {
          const owner = specialMapMock
          const generation = mockMapGeneration
          routePreviewVisible.value = false
          await owner?.simulate()
          if (owner !== specialMapMock || generation !== mockMapGeneration) return
          routePreviewVisible.value = false
        },
        clear: () => {
          mockMapGeneration += 1
          resetRouteVideoPlayback()
          clearMockTrackingTimers()
          specialMapActive = false
          specialMapMock?.clear()
          routePreviewStations.value = []
          routePreviewVisible.value = false
        },
        dispatchVehicles: async (data) => {
          if (!Array.isArray(data)) return
          await receiveMockDispatchVehicles(data as SharedDispatchVehicleMock[])
        },
      },
    })
  }

  /** 停用：variant 切回 main 时调用（幂等） */
  const deactivate = () => {
    if (!active) return
    active = false

    // 调派 attachMap detacher（清空 single-slot active + mock）
    dispatchDetach?.()
    dispatchDetach = null

    stoppedWatchers.forEach((stop) => stop())
    stoppedWatchers = []

    mockSpecialMapUnsubscribers.splice(0).forEach((unsub) => unsub())
    vehicleTrackUnsubscribe?.()
    vehicleTrackUnsubscribe = null

    vehicleTrackStore.reset()

    incidentLocationManager?.destroy()
    incidentLocationManager = null
    renderedMarkers.clear()
    primaryStationManager?.destroy()
    primaryStationManager = null
    renderedPrimaryStations.clear()

    if (featureClickQuery) {
      featureClickQuery.destroy()
      featureClickQuery = null
    }
    if (unifiedPopupClickKey) {
      unByKey(unifiedPopupClickKey)
      unifiedPopupClickKey = null
    }

    clearMockTrackingTimers()
    specialMapActive = false

    // 释放 CQL 占用的 WMS 图层，恢复开关原始状态
    // watch 已在上一步全部 stop，恢复分支不会被触发，必须在此显式还原
    if (forcedStationLayerSnapshot) {
      const snapshot = forcedStationLayerSnapshot
      forcedStationLayerSnapshot = null
      restoreWmsLayerSnapshot(STATION_LAYER_NAME, snapshot)
    }
    forcedResourceLayerSnapshots.forEach((snapshot, layerName) => {
      restoreWmsLayerSnapshot(layerName, snapshot)
    })
    forcedResourceLayerSnapshots.clear()

    // 队站口径回主图态：主管排除集合清空后还回全量队站
    clearMockDispatchStationIcons()
    restoreAllFireStations()

    // 范围圈矢量层与 Modify 交互属调派态资源，离开时清圈并摘交互
    if (resourceCircleLayer) {
      const source = resourceCircleLayer.getSource()
      const feature = source?.getFeatureById(RESOURCE_CIRCLE_FEATURE_ID)
      if (feature) source?.removeFeature(feature)
    }
    if (resourceCircleModify) {
      map?.removeInteraction(resourceCircleModify)
      resourceCircleModify = null
    }
    resourceCircleDragging = false

    mockDispatchState = null

    if (documentClickBound) {
      document.removeEventListener('click', handleDocumentClick, true)
      documentClickBound = false
    }
  }

  /** 彻底清理纠缠体自有资源（不碰 map/nav/共享 4 manager，那些归 map.vue） */
  const dispose = () => {
    deactivate()
    vehicleTrackRenderer?.dispose()
    vehicleTrackRenderer = null
    if (resourceCircleModify) {
      map?.removeInteraction(resourceCircleModify)
      resourceCircleModify = null
    }
    if (resourceCircleLayer) {
      map?.removeLayer(resourceCircleLayer)
      resourceCircleLayer = null
    }
    resourceCircleDragging = false
  }

  return {
    activate,
    deactivate,
    dispose,
    // B-6c：DispatchRoutePreview 挂载所需
    routePreviewVisible,
    routePreviewStations,
    routePreviewLoading,
    selectStationRoute,
  }
}
