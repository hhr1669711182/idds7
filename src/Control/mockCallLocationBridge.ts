import { useMessageStore } from '@/store/useMessageStore'
import { MESSAGE_EVENT_KEY, MESSAGE_SYSTEM, MESSAGE_CHANNEL } from '@/const/const.message.type'
import { SEAT_SHARED_STATE_MOCK_KEY } from '@/Control/seatSharedState'
import { MOCK_CALL_LOCATION_ID } from '@/const/const.message.type'

export type SharedCallLocationMock = {
  updatedAt: number
  lng: number
  lat: number
}

/**
 * 解析 §7 mock 补丁 blob（补丁通道自含版本 v=1，与主契约互不影响）。
 * 版本/形状不符或 JSON 损坏 → null，读侧整体忽略；key 缺省（raw=null）同样返回 null。
 */
const parseSharedCallLocationMock = (raw: string | null): SharedCallLocationMock | null => {
  if (!raw) return null
  try {
    const mock = JSON.parse(raw)
    if (Number(mock?.v) !== 1) return null
    const updatedAt = Number(mock.updatedAt)
    if (!Number.isFinite(updatedAt)) return null
    const lng = Number(mock.callLocation?.lng)
    const lat = Number(mock.callLocation?.lat)
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    return { updatedAt, lng, lat }
  } catch {
    return null
  }
}

/**
 * §7 mock 补丁通道桥接：把 seat-shared-state-mock 的坐标
 * 桥接成与真实来电定位完全相同的 MAP_LOCATE_CALL 事件，
 * 复用阶段门控（popup）、待处理缓存与地图绘标链路。
 *
 * 不自带 storage 监听，由 initMessage 的 onSessionStorage 统一分发。
 */
export const createMockCallLocationBridge = () => {
    const msg = useMessageStore()

    const emitMockLocateCall = (mock: { updatedAt: number; lng: number; lat: number }) => {
        msg.ingest(
            {
                eventKey: MESSAGE_EVENT_KEY.MAP_LOCATE_CALL,
                data: {
                    id: MOCK_CALL_LOCATION_ID,
                    longitude: mock.lng,
                    latitude: mock.lat,
                    radius: 500,
                    Carrier_Loc: '模拟来电定位',
                },
            },
            MESSAGE_CHANNEL.LOCAL_STORAGE,
            MESSAGE_SYSTEM.DISPATCH,
            {
                source: SEAT_SHARED_STATE_MOCK_KEY,
                mock: true,
                mockUpdatedAt: mock.updatedAt,
            },
        )
    }

    const emitMockLocateCallRemove = () => {
        msg.ingest(
            {
                eventKey: MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE,
                data: { id: MOCK_CALL_LOCATION_ID },
            },
            MESSAGE_CHANNEL.LOCAL_STORAGE,
            MESSAGE_SYSTEM.DISPATCH,
            { source: SEAT_SHARED_STATE_MOCK_KEY, mock: true },
        )
    }

    const applyMockCallLocation = (raw: string | null, initial = false) => {
        // 受理席 removeItem / localStorage.clear → storage 事件 newValue=null → 清除补丁（§7.3）；
        // 初始读取时 key 缺省属于「从未写入」，不发移除事件。
        // 非 null 但版本/形状不符或损坏的 blob 按 §7.2/§7.4 整体忽略。
        if (raw === null) {
            if (!initial) emitMockLocateCallRemove()
            return
        }
        const mock = parseSharedCallLocationMock(raw)
        if (mock) emitMockLocateCall(mock)
    }

    return { applyMockCallLocation }
}
