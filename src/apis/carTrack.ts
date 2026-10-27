import { alovaInstance } from '@/service/alova'
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

/**
 * 查询单车历史轨迹。
 * 直连外部车辆定位服务（`/car-track-api` 代理），不可改走 bff-client。
 * 数据仅覆盖贵州车辆，空结果为正常态，见 herness/05-共享上下文/当前状态摘要.md。
 * COLA 信封由 alova 拦截器解包，返回轨迹点数组；业务失败会直接抛错。
 * @param carId 车辆唯一标识（来自警情详情的 vehicleId）。
 */
export const queryCarHistoryTrack = (carId: string) =>
  alovaInstance.Post<CarTrackPoint[]>(
    '/car-track-api/api/car/track/query',
    { carId, beginTime: CAR_TRACK_BEGIN_TIME, endTime: CAR_TRACK_END_TIME },
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
