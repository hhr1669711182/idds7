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

/** 路径规划请求：origins 为队站坐标，destination 为警情点；seq 防重复请求不触发 watcher */
export type IncidentLocationRoutePlanRequest = {
  origins: LngLat[]
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
  /** 全部业务方声明的队站 ID 并集，供地图侧生成 CQL_FILTER */
  const selectedStationIds = computed<string[]>(() => {
    const union = new Set<string>()
    Object.values(entries).forEach((ids) => {
      ids.forEach((id) => union.add(id))
    })
    return [...union]
  })
  const setStations = (owner: string, ids: string[]) => {
    const normalized = [
      ...new Set(
        ids.map((id) => String(id ?? '').trim()).filter(Boolean),
      ),
    ]
    entries[owner] = normalized
  }
  const clearOwner = (owner: string) => {
    delete entries[owner]
  }
  return { entries, selectedStationIds, setStations, clearOwner }
})

/** 警情定位点位在队站图层 store 中使用的 owner 前缀 */
export const LOCATION_STATION_OWNER_PREFIX = 'loc:'
/** DispatchT1 立案查询在队站图层 store 中使用的固定 owner */
export const DISPATCH_T1_STATION_OWNER = 'dispatchT1'

export const useIncidentLocationStore = defineStore(
  'incidentLocationStore',
  () => {
    /** 当前有效点位（坐标被清空的画像不保留），地图重建后据此重绘 */
    const markers = reactive<Record<string, IncidentLocationMarker>>({})
    /** 各点位当前命中的辖区面，与 markers 同 key；点位清空/未命中/查询失败时移除 */
    const zones = reactive<Record<string, IncidentLocationZone>>({})
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

    const upsertMarker = (entry: IncidentLocationMarker) => {
      markers[entry.key] = entry
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
      })
        .then((result) => {
          if (zoneRequestTokens[entry.key] !== token) return
          // 清除该点位的旧辖区，再写入新结果
          removeZonesForMarker(entry.key)
          // 主管 + 支撑队站写入共享队站图层 store，由地图侧在唯一 WMS
          // 消防站图层上按并集 CQL_FILTER 显示（与立案调派流程同一图层）
          useStationLayerStore().setStations(
            `${LOCATION_STATION_OWNER_PREFIX}${entry.key}`,
            [result.primary.id, ...result.support.map((station) => station.id)],
          )
          // 主管辖区
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

          // 路径规划请求：主管 + 支撑队站坐标 → 警情点，由 dispatchMap.vue 消费
          const origins: LngLat[] = [
            result.primary.coordinate,
            ...result.support.map((s) => s.coordinate),
          ]
          routePlanSeq += 1
          routePlanRequest.value = {
            origins,
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
          useStationLayerStore().clearOwner(
            `${LOCATION_STATION_OWNER_PREFIX}${entry.key}`,
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
      })

      const lng = Number(data.longitude)
      const lat = Number(data.latitude)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        // 经纬度缺失/清空：整体替换口径下移除旧位置
        removeMarker(key)
        return
      }

      const entry: IncidentLocationMarker = {
        key,
        lng,
        lat,
        address: data.address,
        incidentId: data.incidentId ?? null,
        disasterProfileId: data.disasterProfileId ?? null,
        version,
      }
      upsertMarker(entry)
      // 点位上图后查询所属辖区并写入 zones，辖区面由 dispatchMap.vue 渲染
      fetchJurisdiction(entry)
    }

    return {
      markers,
      zones,
      versions,
      focusRequest,
      routePlanRequest,
      onAddressUpdated,
      upsertMarker,
      upsertIncidentFromAlarm,
      removeMarker,
      consumeFocus,
      consumeRoutePlan,
    }
  },
)
