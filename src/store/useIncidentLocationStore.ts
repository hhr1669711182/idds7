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
import { computed, reactive, ref } from 'vue'
import type { MessageEnvelope } from '@/types/message'
import type { AddressUpdatedData } from '@/Control/incidentLocationMessage'
import { queryIncidentStations } from '@/controller/core/business/IncidentStationQuery'
import {
  DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
  queryIncidentNearbyResources,
  type NearbyResource,
} from '@/controller/core/business/IncidentNearbyResourceQuery'
import type { LngLat } from '@/baseComponent/amap/useAmapTools'

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
  const normalizeIds = (ids: string[]) => [
    ...new Set(
      ids.map((id) => String(id ?? '').trim()).filter(Boolean),
    ),
  ]
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
        Number.isFinite(circle.lng)
        && Number.isFinite(circle.lat)
        && Number.isFinite(circle.radiusMeters)
        && circle.radiusMeters > 0,
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
    /** 最新待定位坐标，由 dispatchMap.vue 消费 */
    const focusRequest = ref<IncidentLocationFocusRequest | null>(null)
    /** 最新待规划路径请求（队站 origins + 警情点 destination），由 dispatchMap.vue 消费后调 nav.fetchRoutesAndEta + renderRoutesOnly */
    const routePlanRequest = ref<IncidentLocationRoutePlanRequest | null>(null)

    let focusSeq = 0
    let routePlanSeq = 0
    /** 每个画像辖区查询的请求令牌，仅最后一次请求的结果允许写入，避免竞态 */
    const zoneRequestTokens: Record<string, number> = {}

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
      zoneRequestTokens[key] = (zoneRequestTokens[key] ?? 0) + 1
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
      const token = (zoneRequestTokens[entry.key] ?? 0) + 1
      zoneRequestTokens[entry.key] = token
      queryIncidentStations([entry.lng, entry.lat], {
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
          useStationLayerStore().setPrimaryStations(
            owner,
            result.primary ? [result.primary.id] : [],
          )
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
            ]
              .map(({ id, name, coordinate }) => ({ id, name, coordinate })),
            destination: [entry.lng, entry.lat],
            markerKey: entry.key,
            seq: routePlanSeq,
          }
        })
        .catch((error) => {
          if (zoneRequestTokens[entry.key] !== token) return
          console.warn('[address-updated] 查询队站辖区失败', {
            key: entry.key,
            error,
          })
          removeZonesForMarker(entry.key)
          delete primaryStations[entry.key]
          useStationLayerStore().clearOwner(
            `${LOCATION_STATION_OWNER_PREFIX}${entry.key}`,
          )
        })

      // 周边资源（500 米内消防栓/重点单位/队站辖区/建筑）：与队站查询并行，互不影响结果写入。
      // 查询成功后写入结果并向 WMS 图层 store 声明范围圈（dispatchMap watch 后
      // 对消防栓/重点单位/队站辖区/建筑图层下范围圈过滤强制上图）；失败时清除旧声明。
      queryIncidentNearbyResources([entry.lng, entry.lat], {
        radiusMeters: DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
      })
        .then((result) => {
          if (zoneRequestTokens[entry.key] !== token) return
          nearbyResources[entry.key] = {
            key: entry.key,
            radiusMeters: DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
            fireHydrants: result.fireHydrants,
            keyEnterprises: result.keyEnterprises,
            jurisZones: result.jurisZones,
            buildings: result.buildings,
            version: entry.version,
          }
          useNearbyResourceLayerStore().setCircles(
            `${LOCATION_RESOURCE_OWNER_PREFIX}${entry.key}`,
            [{
              lng: entry.lng,
              lat: entry.lat,
              radiusMeters: DEFAULT_NEARBY_RESOURCE_RADIUS_METERS,
            }],
          )
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
          console.warn('[address-updated] 查询周边资源失败', {
            key: entry.key,
            error,
          })
          delete nearbyResources[entry.key]
          useNearbyResourceLayerStore().clearOwner(
            `${LOCATION_RESOURCE_OWNER_PREFIX}${entry.key}`,
          )
        })
    }

    /** dispatchMap 消费定位请求后置空；无图层时不调用，保留给下次挂载 */
    const consumeFocus = () => {
      focusRequest.value = null
    }

    /** dispatchMap 消费路径规划请求后置空；无 nav 时保留，待挂载后消费 */
    const consumeRoutePlan = () => {
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
      focusRequest.value = null
      routePlanRequest.value = null
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
      if (existing && existing.version > 0) return
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

    const onAddressUpdated = (envelope: MessageEnvelope<AddressUpdatedData>) => {
      const data = envelope.data
      if (!data) return

      // 与立案点位按 incidentId 归并同一要素；无 incidentId 时退回画像/事件 ID
      const key = String(
        data.incidentId || data.disasterProfileId || data.eventId || '',
      ).trim()
      if (!key) {
        console.warn('[address-updated] 消息缺少画像/警情/事件 ID，已忽略', data)
        return
      }

      // 版本去重：只处理更大的 version；消息未带 version 时不拦截
      const version = Number(data.version) || 0
      const handledVersion = versions[key]
      if (
        version > 0 &&
        typeof handledVersion === 'number' &&
        version <= handledVersion
      ) {
        console.info('[address-updated] 跳过旧版本地址消息', {
          key,
          version,
          handledVersion,
        })
        return
      }
      versions[key] = version

      console.info('[address-updated] 收到画像地址变更', {
        key,
        incidentId: data.incidentId,
        version,
        longitude: data.longitude,
        latitude: data.latitude,
        address: data.address,
        primaryStationId: data.primaryStationId,
      })

      // 已上图的旧点位：增量消息未携带的槽位（坐标/地址/主管）需沿用其值
      const existing = markers[key]

      let lng = Number(data.longitude)
      let lat = Number(data.latitude)
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng === 0 || lat === 0) {
        // 槽位在累计快照中存在但值为空，才表示坐标被显式清空
        const lngCleared = Object.prototype.hasOwnProperty.call(data.slots, 'longitude')
          && !Number.isFinite(Number(data.slots.longitude))
        const latCleared = Object.prototype.hasOwnProperty.call(data.slots, 'latitude')
          && !Number.isFinite(Number(data.slots.latitude))
        if (lngCleared || latCleared) {
          // 经纬度任一被清空时自动移除该画像对应的 marker 及关联辖区/路径
          removeMarker(key)
          return
        }
        // 本次增量未携带坐标（如仅推送 m_org_id）：必须有之前已上图的点位坐标，
        // 才能重新定位并更新其主管队站/辖区；从未上图则无坐标可用，回滚版本号，
        // 等待后续携带坐标的消息（版本号可能更小，如补发/重放）建点
        if (!existing) {
          if (typeof handledVersion === 'number') versions[key] = handledVersion
          else delete versions[key]
          console.info('[address-updated] 消息无坐标且无已上图点位，暂不处理', {
            key,
            version,
          })
          return
        }
        lng = existing.lng
        lat = existing.lat
      }

      // 槽位未出现在本次累计快照中表示该字段未变更，沿用旧点位值，避免增量消息
      // （如只改 m_org_id）把地址、主管队站等冲成空值
      const address = Object.prototype.hasOwnProperty.call(data.slots, 'disaster_address')
        ? data.address
        : existing?.address ?? null
      const primaryStationId = Object.prototype.hasOwnProperty.call(data.slots, 'm_org_id')
        ? data.primaryStationId
        : existing?.primaryStationId ?? null

      const entry: IncidentLocationMarker = {
        key,
        lng,
        lat,
        address,
        incidentId: data.incidentId ?? existing?.incidentId ?? null,
        disasterProfileId: data.disasterProfileId ?? existing?.disasterProfileId ?? null,
        version,
        coordinateSource: 'slotChanges',
        primaryStationId,
      }
      // data 为累计全量快照：与已上图点位对比即可知本条消息是否真的移动了坐标。
      // 坐标变化（或新点位）才触发定位飞行；坐标未变（如仅 m_org_id 槽位变更）时
      // 只原地更新 marker，不重新定位。
      const coordinateChanged = !existing
        || existing.lng !== lng
        || existing.lat !== lat
      // m_org_id 取累计快照中的最新值（即 slotChanges 传来合并后的值）；
      // 主管队站变化时才需重查并替换主管/支撑队站图标（同原辖区替换的派生链路）
      const primaryStationChanged = (existing?.primaryStationId ?? null) !== primaryStationId
      upsertMarker(entry, coordinateChanged)
      // 点位上图/坐标移动后查询队站；或主管队站变更时以 forcedPrimaryStationId
      // 强制覆盖重查，主管 zhu.png 图标与支撑队站图层过滤按新结果替换，
      // 但坐标未变时不触发定位飞行
      if (coordinateChanged || primaryStationChanged) {
        fetchJurisdiction(entry)
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
        if (zones[entry.key] && nearbyResources[entry.key]) return
        fetchJurisdiction(entry)
      })
    }

    return {
      markers,
      zones,
      primaryStations,
      nearbyResources,
      versions,
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
      pick: ['markers', 'versions'],
    },
  },
)
