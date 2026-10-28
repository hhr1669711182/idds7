/**
 * @Description: 警情定位（画像地址变更）数据 store。
 * 经 useMessageStore 订阅 DISASTER_PROFILE / ADDRESS_UPDATED 消息并持有：
 * 1. markers —— 当前有效点位（按画像 ID 去重，经纬度被清空即移除），
 *    由 dispatchMap.vue watch 后渲染到地图图层；
 * 2. zones —— 各点位命中的主管辖区 + 支撑队站辖区面（queryIncidentStations 查询），
 *    主管用 markerKey 做 zone key，支撑用 `${markerKey}::${stationId}`；
 *    点位上图后异步查询，未命中/失败/点位移除时同步移除，由 dispatchMap 渲染面图层；
 * 3. versions —— 每个画像已处理的最大 version，只接受更大版本（可跳号）；
 * 4. focusRequest —— 最新待定位坐标，dispatchMap 消费后置空；
 *    消息先于地图挂载到达时保留，等 dispatch1 页面挂载后定位。
 * 路由切换由 seatSharedState 的 inquiry→dispatch 阶段自动完成，本 store 不负责导航。
 * @FilePath: src/store/useIncidentLocationStore.ts
 */
import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'
import type { MessageEnvelope } from '@/types/message'
import type {
  AddressUpdatedData,
  IncidentLocationAcceptance,
  IncidentLocationContext,
} from '@/controller/core/protocol/IncidentLocationProtocol'
import {
  deriveSlotSnapshot,
  getAddressProfileKey,
  getIncidentLocationContextKey,
  normalizeIncidentLocationContent,
} from '@/utils/incidentLocation'
import { queryIncidentStations } from '@/controller/core/business/IncidentStationQuery'
import {
  DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
  queryIncidentNearbyResources,
  type NearbyResource,
} from '@/controller/core/business/IncidentNearbyResourceQuery'
import type { LngLat } from '@/utils/coordTransform'
import {
  useStationLayerStore,
  useNearbyResourceLayerStore,
  LOCATION_STATION_OWNER_PREFIX,
  LOCATION_RESOURCE_OWNER_PREFIX,
} from './useStationLayerStore'

/** 单个警情定位点位（key = 画像 ID，缺省退回 incidentId/eventId） */
export type IncidentLocationMarker = {
  key: string
  lng: number
  lat: number
  address: string | null
  incidentId: string | null
  disasterProfileId: string | null
  version: number
  /** 坐标来源；只有 slotChanges 正式坐标可以替换来电粗定位圈。 */
  coordinateSource: 'alarm' | 'slotChanges'
  /** 消息 m_org_id 指定的主管队站 ID（view_juris_zone.zone_id）；null 时按坐标命中辖区判定 */
  primaryStationId: string | null
}

/** 待定位坐标请求，seq 用于保证相同坐标的重复请求也能触发 watcher */
export type IncidentLocationFocusRequest = {
  lng: number
  lat: number
  seq: number
}

/** 辖区角色：'primary' 为报警点命中的主管辖区，'support' 为支撑队站辖区 */
export type JurisdictionRole = 'primary' | 'support'

/** 点位命中的辖区面，主管用 markerKey 做 zone key，支撑用 `${markerKey}::${stationId}` */
export type IncidentLocationZone = {
  key: string
  zoneId: string
  zoneName: string
  geometry: GeoJSON.Geometry
  version: number
  role: JurisdictionRole
}

/**
 * 点位命中的主管队站点位（独立 zhu.png 图标上图），key 与 marker 相同。
 * 派生物，不持久化：点位移除/主管未命中/查询失败时同步移除，刷新后按 markers 重查重建。
 */
export type IncidentPrimaryStation = {
  /** = 所属 marker key */
  key: string
  stationId: string
  name: string
  address: string
  lng: number
  lat: number
  version: number
}

/**
 * 点位周边资源查询结果（消防栓/重点单位/队站辖区/建筑），与 markers 同 key。
 * 派生物，不持久化：点位移除/查询失败时同步移除，刷新后按 markers 重查重建。
 * 范围圈同步声明到 useNearbyResourceLayerStore，由地图侧对 WMS 图层强制过滤上图。
 */
export type IncidentNearbyResources = {
  /** = 所属 marker key */
  key: string
  /** 本次查询半径（米），与 WMS 图层 DWITHIN 过滤半径保持一致 */
  radiusMeters: number
  fireHydrants: NearbyResource[]
  keyEnterprises: NearbyResource[]
  jurisZones: NearbyResource[]
  buildings: NearbyResource[]
  version: number
}

/** 路径规划请求：origins 为队站坐标，destination 为警情点；seq 防重复请求不触发 watcher */
export type IncidentLocationRoutePlanRequest = {
  origins: LngLat[]
  stations?: { id: string; name: string; coordinate: LngLat }[]
  destination: LngLat
  markerKey: string
  seq: number
}

/**
 * 警情/调派相关队站图层（唯一 WMS 图层 gis:view_res_org_dept）的过滤状态。
 * 多个业务方（警情定位各点位、DispatchT1 立案查询）按 ownerKey 声明各自需要
 * 显示的主管/支撑队站 ID，地图侧取并集对 WMS 图层做 CQL_FILTER 并强制显示；
 * 所有业务方清空后，由地图侧恢复图层开关的原始可见性与过滤条件。
 *
 * 注意：useStationLayerStore / useNearbyResourceLayerStore 已拆分至
 * ./useStationLayerStore.ts，此处仅保留 re-export 供存量 import 路径不改动。
 */
export {
  useStationLayerStore,
  useNearbyResourceLayerStore,
  LOCATION_STATION_OWNER_PREFIX,
  LOCATION_RESOURCE_OWNER_PREFIX,
  DISPATCH_T1_STATION_OWNER,
  type NearbyResourceCircle,
} from './useStationLayerStore'

export const useIncidentLocationStore = defineStore(
  'incidentLocationStore',
  () => {
    /** 当前有效点位（坐标被清空的画像不保留），地图重建后据此重绘 */
    const markers = reactive<Record<string, IncidentLocationMarker>>({})
    /** 各点位当前命中的辖区面，与 markers 同 key；点位清空/未命中/查询失败时移除 */
    const zones = reactive<Record<string, IncidentLocationZone>>({})
    /** 各点位当前命中的主管队站点位（独立 zhu.png 图标），与 markers 同 key */
    const primaryStations = reactive<Record<string, IncidentPrimaryStation>>({})
    /** 各点位半径内周边资源（消防栓/重点单位），与 markers 同 key；派生物不持久化 */
    const nearbyResources = reactive<Record<string, IncidentNearbyResources>>({})
    /** 按画像 ID 维护地址主题自己的版本号，只处理更大的 version（可跳号） */
    const versions = reactive<Record<string, number>>({})
    const profileSnapshots = reactive<Record<string, AddressUpdatedData>>({})
    const activeKey = ref('')
    const acceptanceRevision = ref(0)
    const contextRevision = ref(0)
    const context = ref<IncidentLocationContext | null>(null)
    let contextBound = false
    /** 最新待定位坐标，由 dispatchMap.vue 消费 */
    const focusRequest = ref<IncidentLocationFocusRequest | null>(null)
    /** 最新待规划路径请求（队站 origins + 警情点 destination），由 dispatchMap.vue 消费后调 nav.fetchRoutesAndEta + renderRoutesOnly */
    const routePlanRequest = ref<IncidentLocationRoutePlanRequest | null>(null)

    let focusSeq = 0
    let routePlanSeq = 0
    /** 每个画像辖区查询的请求令牌，仅最后一次请求的结果允许写入，避免竞态 */
    const zoneRequestTokens: Record<string, number> = {}
    const pendingQueries = new Set<string>()
    const resolvedQueries = new Set<string>()
    let querySequence = 0

    /**
     * 写入/更新点位。focus=false 时仅原地更新 marker 字段（如仅 m_org_id 变更、
     * 坐标未变），不发定位飞行请求；队站图标替换由 fetchJurisdiction 派生。
     */
    const upsertMarker = (entry: IncidentLocationMarker, focus = true) => {
      markers[entry.key] = entry
      if (!focus) return
      focusSeq += 1
      focusRequest.value = { lng: entry.lng, lat: entry.lat, seq: focusSeq }
    }

    /** 移除某点位关联的所有辖区（主管 + 支撑），供点位移除/查询失败时清理 */
    const removeZonesForMarker = (markerKey: string) => {
      const prefix = `${markerKey}::`
      for (const zoneKey of Object.keys(zones)) {
        if (zoneKey === markerKey || zoneKey.startsWith(prefix)) {
          delete zones[zoneKey]
        }
      }
    }

    const removeMarker = (key: string) => {
      // 作废在途辖区/路径查询，防止旧响应在点位移除后回写
      zoneRequestTokens[key] = ++querySequence
      pendingQueries.delete(key)
      resolvedQueries.delete(key)
      delete markers[key]
      removeZonesForMarker(key)
      // 同步移除主管队站独立图标点位
      delete primaryStations[key]
      // 同步移除周边资源查询结果并释放消防栓/重点单位 WMS 图层范围圈声明
      delete nearbyResources[key]
      useNearbyResourceLayerStore().clearOwner(`${LOCATION_RESOURCE_OWNER_PREFIX}${key}`)
      // 同步释放该点位在共享队站图层上的过滤声明
      useStationLayerStore().clearOwner(`${LOCATION_STATION_OWNER_PREFIX}${key}`)
      // 若该点位的路径请求尚未消费，清空以免旧请求触发渲染
      if (routePlanRequest.value?.markerKey === key) {
        routePlanRequest.value = null
      }
    }

    /**
     * 点位上图后异步查询主管/支撑队站及其辖区（queryIncidentStations），
     * 将主管辖区 + 各支撑辖区写入 zones，由 dispatchMap.vue watch 后渲染面图层；
     * 同时将队站坐标 + 警情点坐标写入 routePlanRequest，由 dispatchMap.vue 消费后调
     * nav.fetchRoutesAndEta + nav.renderRoutesOnly 渲染驾车路线（仅路线，无车辆动画）。
     * 不阻塞点位上图与定位。
     */
    const fetchJurisdiction = (entry: IncidentLocationMarker) => {
      const token = ++querySequence
      zoneRequestTokens[entry.key] = token
      pendingQueries.add(entry.key)
      resolvedQueries.delete(entry.key)
      let queriesSucceeded = true
      const stationQuery = queryIncidentStations([entry.lng, entry.lat], {
        showAllJurisdictions: true,
        // m_org_id 指定主管队站时强制覆盖坐标命中辖区，主管站/辖区面以消息为准
        forcedPrimaryStationId: entry.primaryStationId,
      })
        .then((result) => {
          if (zoneRequestTokens[entry.key] !== token) return
          // 清除该点位的旧辖区，再写入新结果
          removeZonesForMarker(entry.key)
          const owner = `${LOCATION_STATION_OWNER_PREFIX}${entry.key}`

          // 主管 + 支撑队站 id（主管站未命中时仅支撑队站）
          const stationIds = [
            ...(result.primary ? [result.primary.id] : []),
            ...result.support.map((station) => station.id),
          ]
          if (!stationIds.length) {
            // 警情点附近一个消防站都没有：释放队站图层过滤，仅控制台提示
            console.warn('[address-updated] 警情点附近未查询到消防站', {
              key: entry.key,
              coordinate: [entry.lng, entry.lat],
            })
            delete primaryStations[entry.key]
            useStationLayerStore().clearOwner(owner)
            if (routePlanRequest.value?.markerKey === entry.key) routePlanRequest.value = null
            return
          }
          if (!result.primary) {
            // 主管站未命中消防站图层：不报错，仅展示附近支撑队站
            console.warn('[address-updated] 未命中主管消防站，仅展示周边支撑队站', {
              key: entry.key,
              stationId: entry.primaryStationId,
            })
            delete primaryStations[entry.key]
          }
          console.log('[address-updated] 查询到消防站', {
            key: result?.primary?.name ?? '',
            stationIds: result.support.map((station) => station.name).join(','),
          })
          // 队站写入共享队站图层 store，由地图侧在唯一 WMS
          // 消防站图层上按并集 CQL_FILTER 显示（与立案调派流程同一图层）
          useStationLayerStore().setStations(owner, stationIds)
          // 主管以独立 zhu.png 图标上图：声明主管 id（全量消防站图层据此排除），
          // 并写入主管点位供 dispatchMap.vue 的主管图层渲染
          useStationLayerStore().setPrimaryStations(owner, result.primary ? [result.primary.id] : [])
          if (result.primary) {
            primaryStations[entry.key] = {
              key: entry.key,
              stationId: result.primary.id,
              name: result.primary.name,
              address: result.primary.address,
              lng: result.primary.coordinate[0],
              lat: result.primary.coordinate[1],
              version: entry.version,
            }
          }
          /* 主管/支撑辖区写入已禁用（辖区查询结果不再写入 zones）
          // 主管辖区
          if (result.primary) {
            const primaryGeom = result.jurisdictions.get(result.primary.id)
            if (primaryGeom) {
              zones[entry.key] = {
                key: entry.key,
                zoneId: result.primary.id,
                zoneName: result.primary.name,
                geometry: primaryGeom,
                version: entry.version,
                role: 'primary',
              }
            }
          }
          // 支撑辖区
          result.support.forEach((station) => {
            const geom = result.jurisdictions.get(station.id)
            if (!geom) return
            const zoneKey = `${entry.key}::${station.id}`
            zones[zoneKey] = {
              key: zoneKey,
              zoneId: station.id,
              zoneName: station.name,
              geometry: geom,
              version: entry.version,
              role: 'support',
            }
          })
          */

          // 路径规划请求：仅主管队站坐标 → 警情点，由 dispatchMap.vue 消费
          // （支撑队站到警情点的路径规划已注释禁用；主管未命中时无起点）
          const origins: LngLat[] = [
            ...(result.primary ? [result.primary.coordinate] : []),
            // 支撑队站路径规划已禁用
            // ...result.support.map((s) => s.coordinate),
          ]
          routePlanSeq += 1
          routePlanRequest.value = {
            origins,
            // 支撑队站路径规划已禁用：stations 仅保留主管
            stations: [
              ...(result.primary ? [result.primary] : []),
              // ...result.support,
            ].map(({ id, name, coordinate }) => ({ id, name, coordinate })),
            destination: [entry.lng, entry.lat],
            markerKey: entry.key,
            seq: routePlanSeq,
          }
        })
        .catch((error) => {
          if (zoneRequestTokens[entry.key] !== token) return
          queriesSucceeded = false
          console.warn('[address-updated] 查询队站辖区失败', {
            key: entry.key,
            error,
          })
          removeZonesForMarker(entry.key)
          delete primaryStations[entry.key]
          useStationLayerStore().clearOwner(`${LOCATION_STATION_OWNER_PREFIX}${entry.key}`)
          if (routePlanRequest.value?.markerKey === entry.key) routePlanRequest.value = null
        })

      // 周边资源（500 米内消防栓/重点单位/队站辖区/建筑）：与队站查询并行，互不影响结果写入。
      // 查询成功后写入结果并向 WMS 图层 store 声明范围圈（dispatchMap watch 后
      // 对消防栓/重点单位/队站辖区/建筑图层下范围圈过滤强制上图）；失败时清除旧声明。
      const nearbyQuery = queryIncidentNearbyResources([entry.lng, entry.lat], {
        radiusMeters: DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
      })
        .then((result) => {
          if (zoneRequestTokens[entry.key] !== token) return
          if (!result.complete) queriesSucceeded = false
          nearbyResources[entry.key] = {
            key: entry.key,
            radiusMeters: DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
            fireHydrants: result.fireHydrants,
            keyEnterprises: result.keyEnterprises,
            jurisZones: result.jurisZones,
            buildings: result.buildings,
            version: entry.version,
          }
          useNearbyResourceLayerStore().setCircles(`${LOCATION_RESOURCE_OWNER_PREFIX}${entry.key}`, [
            {
              lng: entry.lng,
              lat: entry.lat,
              radiusMeters: DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
            },
          ])
          console.info('[address-updated] 查询到周边资源', {
            key: entry.key,
            radiusMeters: DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
            fireHydrants: result.fireHydrants.length,
            keyEnterprises: result.keyEnterprises.length,
            jurisZones: result.jurisZones.length,
            buildings: result.buildings.length,
          })
        })
        .catch((error) => {
          if (zoneRequestTokens[entry.key] !== token) return
          queriesSucceeded = false
          console.warn('[address-updated] 查询周边资源失败', {
            key: entry.key,
            error,
          })
          delete nearbyResources[entry.key]
          useNearbyResourceLayerStore().clearOwner(`${LOCATION_RESOURCE_OWNER_PREFIX}${entry.key}`)
        })
      void Promise.allSettled([stationQuery, nearbyQuery]).then(() => {
        if (zoneRequestTokens[entry.key] !== token) return
        pendingQueries.delete(entry.key)
        if (queriesSucceeded) resolvedQueries.add(entry.key)
      })
    }

    /** dispatchMap 消费定位请求后置空；无图层时不调用，保留给下次挂载 */
    const consumeFocus = (seq?: number) => {
      if (seq !== undefined && focusRequest.value?.seq !== seq) return
      focusRequest.value = null
    }

    /** dispatchMap 消费路径规划请求后置空；无 nav 时保留，待挂载后消费 */
    const consumeRoutePlan = (seq?: number) => {
      if (seq !== undefined && routePlanRequest.value?.seq !== seq) return
      routePlanRequest.value = null
    }

    /**
     * 清空所有警情定位运行态：点位、辖区、队站过滤声明、待消费请求及消息版本号。
     * 供 dispatchMap 卸载（如 /dispatch1 -> /map）及刷新阶段不匹配时调用；
     * 非 dispatch 阶段的消息由 messageStageGate 门控拦截，无需保留 versions 去重。
     * 清空后持久化插件自动把空 markers/versions 写回 sessionStorage。
     */
    const clearAll = () => {
      Object.keys(markers).forEach((key) => removeMarker(key))
      Object.keys(versions).forEach((key) => delete versions[key])
      Object.keys(profileSnapshots).forEach((key) => delete profileSnapshots[key])
      for (const key of Object.keys(zoneRequestTokens)) zoneRequestTokens[key] = ++querySequence
      pendingQueries.clear()
      resolvedQueries.clear()
      activeKey.value = ''
      acceptanceRevision.value += 1
      contextRevision.value += 1
      focusRequest.value = null
      routePlanRequest.value = null
    }

    const setContext = (next: IncidentLocationContext) => {
      const previous = context.value
      if (
        previous &&
        ((contextBound && previous.sessionEpoch !== next.sessionEpoch) ||
          previous.sessionKey !== next.sessionKey ||
          previous.stage !== next.stage ||
          previous.incidentId !== next.incidentId)
      )
        clearAll()
      context.value = { ...next }
      contextBound = true
    }

    /**
     * 立案/调派流程（ALARM_INCIDENT STATE_CHANGED → DispatchT1）的警情点写入：
     * 与画像地址变更共用唯一点位图层，按 incidentId 归并，保证两条消息链路
     * 不会各画一个警情点。不触发定位飞行与辖区查询——视图飞行、队站/辖区由
     * DispatchT1 自行处理。已收到更高 version 的画像地址后，不用立案快照回滚坐标。
     */
    const upsertIncidentFromAlarm = (input: {
      incidentId: string
      lng: number
      lat: number
      address?: string | null
      disasterType?: string | null
    }) => {
      const key = String(input.incidentId ?? '').trim()
      if (!key || !Number.isFinite(input.lng) || !Number.isFinite(input.lat)) return
      const existing = markers[key]
      if ((existing && existing.version > 0) || profileSnapshots[key]) return
      markers[key] = {
        key,
        lng: input.lng,
        lat: input.lat,
        address: input.address ?? null,
        incidentId: key,
        disasterProfileId: existing?.disasterProfileId ?? null,
        version: existing?.version ?? 0,
        coordinateSource: existing?.coordinateSource ?? 'alarm',
        primaryStationId: existing?.primaryStationId ?? null,
      }
    }

    const onAddressUpdated = (envelope: MessageEnvelope<AddressUpdatedData>): IncidentLocationAcceptance => {
      const kind = envelope.meta?.snapshotKind === 'full' ? 'full' : 'delta'
      const normalized = normalizeIncidentLocationContent(envelope.data, kind)
      if (!normalized) return { accepted: false, reason: 'invalid' }
      const data = normalized.data
      let key = getAddressProfileKey(data)
      if (!key) return { accepted: false, reason: 'identity' }
      if (!data.incidentId && data.disasterProfileId) {
        const known = Object.values(profileSnapshots).find(
          (snapshot) => snapshot.disasterProfileId === data.disasterProfileId,
        )
        if (known) {
          key = getAddressProfileKey(known)
          data.incidentId = known.incidentId
        }
      }
      const current = context.value
      if (envelope.meta?.contextRevision !== undefined && envelope.meta.contextRevision !== contextRevision.value)
        return { accepted: false, reason: 'session' }
      if (current && envelope.meta?.sessionEpoch !== undefined && envelope.meta.sessionEpoch !== current.sessionEpoch)
        return { accepted: false, reason: 'session' }
      if (
        current &&
        envelope.meta?.contextKey !== undefined &&
        envelope.meta.contextKey !== getIncidentLocationContextKey(current)
      )
        return { accepted: false, reason: 'session' }
      if (current && current.stage !== 'dispatch') return { accepted: false, reason: 'stage' }
      if (current?.incidentId && data.incidentId !== current.incidentId) return { accepted: false, reason: 'identity' }
      const version = data.version
      const handledVersion = versions[key]
      if (typeof handledVersion === 'number' && handledVersion > 0 && version <= handledVersion) {
        return { accepted: false, reason: 'version' }
      }
      if (
        envelope.meta?.source === 'http-profile' &&
        envelope.meta.requestRevision !== undefined &&
        envelope.meta.requestRevision !== acceptanceRevision.value &&
        (!version || !handledVersion)
      )
        return { accepted: false, reason: 'watermark' }
      const previous = profileSnapshots[key]
      if (
        previous?.disasterProfileId &&
        data.disasterProfileId &&
        previous.disasterProfileId !== data.disasterProfileId
      )
        return { accepted: false, reason: 'identity' }
      const existing = markers[key]
      const seed: Record<string, string | null> =
        previous?.slots ??
        (existing
          ? {
              ...(existing.coordinateSource === 'slotChanges'
                ? { longitude: String(existing.lng), latitude: String(existing.lat) }
                : {}),
              disaster_address: existing.address,
              m_org_id: existing.primaryStationId,
            }
          : {})
      const slots = kind === 'full' ? { ...data.slots } : { ...seed, ...data.slots }
      const snapshot: AddressUpdatedData = {
        ...previous,
        ...data,
        slots,
        ...deriveSlotSnapshot(slots),
        disasterProfileId: data.disasterProfileId ?? previous?.disasterProfileId ?? null,
      }
      Object.keys(markers)
        .filter((markerKey) => markerKey !== key)
        .forEach(removeMarker)
      activeKey.value = key
      versions[key] = version
      profileSnapshots[key] = snapshot
      acceptanceRevision.value += 1
      const lng = snapshot.longitude ?? (kind === 'delta' && !('longitude' in slots) ? (existing?.lng ?? null) : null)
      const lat = snapshot.latitude ?? (kind === 'delta' && !('latitude' in slots) ? (existing?.lat ?? null) : null)
      const validCoordinates =
        lng !== null &&
        lat !== null &&
        Number.isFinite(lng) &&
        Number.isFinite(lat) &&
        lng !== 0 &&
        lat !== 0 &&
        Math.abs(lng) <= 180 &&
        Math.abs(lat) <= 90
      const coordinateChanged = validCoordinates && (!existing || existing.lng !== lng || existing.lat !== lat)
      const primaryStationChanged = (existing?.primaryStationId ?? null) !== snapshot.primaryStationId
      if (!validCoordinates) {
        removeMarker(key)
        focusRequest.value = null
      } else {
        const entry: IncidentLocationMarker = {
          key,
          lng,
          lat,
          address: snapshot.address,
          incidentId: snapshot.incidentId ?? existing?.incidentId ?? null,
          disasterProfileId: snapshot.disasterProfileId ?? existing?.disasterProfileId ?? null,
          version,
          coordinateSource:
            'longitude' in slots && 'latitude' in slots ? 'slotChanges' : (existing?.coordinateSource ?? 'slotChanges'),
          primaryStationId: snapshot.primaryStationId,
        }
        upsertMarker(entry, coordinateChanged)
        if (coordinateChanged || primaryStationChanged) fetchJurisdiction(entry)
      }
      return {
        accepted: true,
        key,
        version,
        snapshot,
        snapshotKind: kind,
        coordinateChanged,
        primaryStationChanged,
        removed: !validCoordinates,
      }
    }

    /**
     * 地图挂载后恢复：为已存在的点位（含 sessionStorage 持久化、刷新后恢复的点）
     * 重建辖区面、队站图层过滤声明、周边资源范围圈、路径规划等派生数据。
     * zones/队站过滤/周边资源/路径均为派生物，不持久化，刷新后按 marker 重新查询即可，
     * 保证 marker 为唯一真源；派生数据已齐全的点位（消息先于挂载到达）不重复查询。
     */
    const restoreOnMapMount = () => {
      Object.values(markers).forEach((entry) => {
        if (pendingQueries.has(entry.key) || resolvedQueries.has(entry.key)) return
        fetchJurisdiction(entry)
      })
    }

    return {
      markers,
      zones,
      primaryStations,
      nearbyResources,
      versions,
      profileSnapshots,
      activeKey,
      acceptanceRevision,
      contextRevision,
      context,
      setContext,
      focusRequest,
      routePlanRequest,
      onAddressUpdated,
      upsertMarker,
      upsertIncidentFromAlarm,
      removeMarker,
      consumeFocus,
      consumeRoutePlan,
      clearAll,
      restoreOnMapMount,
    }
  },
  {
    // F5 刷新调派页（stage=dispatch）后点位仍可上图；关闭标签页自动失效。
    // 仅持久化点位与消息版本，zones/队站过滤/周边资源/路径请求挂载后按 markers 重查重建。
    persist: {
      storage: sessionStorage,
      pick: ['markers', 'versions', 'profileSnapshots', 'activeKey', 'context'],
    },
  },
)
