import dayjs from 'dayjs'
import { alovaInstance } from '@/service/alova'
import { getHistoryTrackRouteColor } from '@/baseComponent/OpenlayersMap/style/palette'
import type { IncidentDetailResponseData } from '@/baseComponent/OpenlayersMap/IncidentDetailDialog.vue'

/** 历史轨迹查询时间范围：暂写死，后续按车辆所属消防站及发车时间扩展。 */
export const CAR_TRACK_BEGIN_TIME = '2026-08-17 16:00:00'
export const CAR_TRACK_END_TIME = '2026-08-17 17:00:00'

/** 车辆历史轨迹单个轨迹点（外部厂商接口响应经服务端转换后的对外契约）。 */
export interface CarTrackPoint {
  carId: string
  plateNumber: string
  longitude: number
  latitude: number
  /** 格式 yyyy-MM-dd HH:mm:ss */
  gpsTime: string
}

const trackMethodConfig = { cacheFor: 0, meta: { showError: false } }

/** 历史轨迹查询时间范围（动态化 queryCarHistoryTrack 入参）。 */
export interface TrackTimeRange {
  beginTime?: string | null
  endTime?: string | null
}

/** 将任意时间值归一化为轨迹接口要求的 `yyyy-MM-dd HH:mm:ss`，空值/非法值返回 null。 */
const normalizeTrackTime = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null
  const d = dayjs(value as string | number | Date)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : null
}

/**
 * 查询单车历史轨迹。
 * 直连外部车辆定位服务（`/car-track-api` 代理），不可改走 bff-client。
 * 数据仅覆盖贵州车辆，空结果为正常态，见 herness/05-共享上下文/当前状态摘要.md。
 * COLA 信封由 alova 拦截器解包，返回轨迹点数组；业务失败会直接抛错。
 * @param carId 车辆唯一标识（来自警情详情的 vehicleId）。
 * @param timeRange 可选时间范围；缺失时回退到 CAR_TRACK_BEGIN_TIME / CAR_TRACK_END_TIME（写死兜底）。
 */
export const queryCarHistoryTrack = (carId: string, timeRange?: TrackTimeRange) =>
  alovaInstance.Post<CarTrackPoint[]>(
    '/car-track-api/api/car/track/query',
    {
      // 查询车辆历史轨迹 '8aee87a783f84e21018432fe5e814311'
      carId: carId,
      beginTime: timeRange?.beginTime ?? CAR_TRACK_BEGIN_TIME,
      endTime: timeRange?.endTime ?? CAR_TRACK_END_TIME,
    },
    trackMethodConfig,
  )

/**
 * 取警情详情里最新批次的第一辆车。
 * 提取路径：data.dispatchInfo.batches[].stations[].vehicles[].vehicleId；
 * 批次按 seq 取最大（seq 缺失时取末项），队站取第一个含车辆者，车辆取首项。
 * @returns vehicleId；任一层级为空或 vehicleId 为空串时返回 null。
 */
export const extractLatestBatchFirstVehicleId = (data?: IncidentDetailResponseData | null): string | null => {
  const batches = data?.dispatchInfo?.batches ?? []
  if (!batches.length) return null

  // seq 全部缺失时以数组末项为最新批次
  let latestBatch = batches[batches.length - 1]
  let latestSeq = Number.NEGATIVE_INFINITY
  for (const batch of batches) {
    const seq = typeof batch?.seq === 'number' && Number.isFinite(batch.seq) ? batch.seq : Number.NEGATIVE_INFINITY
    if (seq > latestSeq) {
      latestSeq = seq
      latestBatch = batch
    }
  }

  for (const station of latestBatch?.stations ?? []) {
    for (const vehicle of station?.vehicles ?? []) {
      const vehicleId = String(vehicle?.vehicleId ?? '').trim()
      if (vehicleId) return vehicleId
    }
  }
  return null
}

/* ============================================================
 * 按警情查询出动车辆接口（GIS出动车辆接口对接文档 2026-11-02）
 * ============================================================ */

/** 警情类型（灾害类型 + 细类）。 */
export interface IncidentTypeInfo {
  type: string | null
  subtype: string | null
}

/** 警情信息段（incident 部分）。 */
export interface IncidentInfo {
  incidentId: string
  incidentType: IncidentTypeInfo | null
  alarmTime: string | null
  burningMaterial: string | null
  keyUnitName: string | null
  incidentState: string | null
  disasterAddress: string | null
  leadStationId: string | null
  leadStationName: string | null
}

/** 出动车辆信息。 */
export interface TurnoutVehicle {
  vehicleId: string
  plateNumber: string | null
  stationId: string | null
  stationName: string | null
  stationAddress: string | null
  /** 出发时间；未出发时为 null */
  startTime: string | null
  /** 归队时间；未归队时为 null */
  endTime: string | null
  /** 调派批次 ID，区分同一辆车多次出动 */
  finalPlanId: string | null
  /** 第几次调派，从 1 开始 */
  dispatchSeq: number | null
}

/** /bff-client/api/v1/gis/incidents/{incidentId}/turnout-vehicles 响应 data。 */
export interface IncidentTurnoutVehiclesData {
  incident: IncidentInfo
  /** null = 车辆数据暂不可用（后端依赖服务出错），[] = 暂无出动车辆 */
  vehicles: TurnoutVehicle[] | null
  meta: { sourceGaps: unknown[]; sourceErrors?: unknown[] }
}

/**
 * 按警情查询全部出动车辆（含开始/结束时间、所属消防站）。
 * GET /bff-client/api/v1/gis/incidents/{incidentId}/turnout-vehicles
 * 不带任何 Query 参数（后端禁止带 rootOrgIds/orgIds/seatId 等）；
 * alova 拦截器已解包 ResultVO 外壳，业务失败直接抛 AppError。
 * 后端尚未上 dev，届时联调。
 * @param incidentId 警情 ID（路径参数，必填）。
 */
export const queryIncidentTurnoutVehicles = (incidentId: string) =>
  alovaInstance.Get<IncidentTurnoutVehiclesData>(
    `/bff-client/api/v1/gis/incidents/${encodeURIComponent(incidentId)}/turnout-vehicles`,
    trackMethodConfig,
  )

/** 路线分组：stationId 相同即同一路线；组内车辆时间不同表示同路线不同时间段调派。 */
export interface RouteGroup {
  /** 路线唯一 key，即 stationId（为空时用 'unknown-station' 占位） */
  key: string
  stationId: string | null
  stationName: string | null
  /** 该路线下的所有出动车辆（同一路线不同时间段调派的多车） */
  vehicles: TurnoutVehicle[]
  /** 路线颜色，从 palette 同色系派生 */
  color: string
}

/**
 * 按 stationId 分组出动车辆 → 路线分组列表。
 * stationId 相同归同一路线；stationId 为空的车辆归到 'unknown-station' 组。
 * 颜色按分组顺序取模 palette 同色系派生池。
 */
export const groupTurnoutVehiclesByStation = (vehicles: TurnoutVehicle[]): RouteGroup[] => {
  const map = new Map<string, TurnoutVehicle[]>()
  for (const vehicle of vehicles) {
    const key = vehicle.stationId || 'unknown-station'
    const list = map.get(key) ?? []
    list.push(vehicle)
    map.set(key, list)
  }

  const result: RouteGroup[] = []
  let index = 0
  for (const [key, groupVehicles] of map) {
    const firstVehicle = groupVehicles[0]
    result.push({
      key,
      stationId: firstVehicle.stationId,
      stationName: firstVehicle.stationName,
      vehicles: groupVehicles,
      color: getHistoryTrackRouteColor(index),
    })
    index += 1
  }
  return result
}

/**
 * 从出动车辆中抽取轨迹查询时间：直接取 startTime/endTime 并归一化为轨迹接口格式。
 * 时间缺失时由调用方走 queryCarHistoryTrack 的 CAR_TRACK_BEGIN_TIME / CAR_TRACK_END_TIME 兜底。
 * @param vehicle 出动车辆（含 startTime / endTime）。
 */
export const supplementTrackTimeFromDetail = (
  vehicle: TurnoutVehicle,
): TrackTimeRange => {
  return {
    beginTime: normalizeTrackTime(vehicle.startTime),
    endTime: normalizeTrackTime(vehicle.endTime),
  }
}
