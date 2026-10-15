import { useMessageStore } from '@/store/useMessageStore'
import { MESSAGE_EVENT_KEY, MESSAGE_SYSTEM, MESSAGE_CHANNEL } from '@/const/const.message.type'
import { SEAT_SHARED_STATE_KEY, SEAT_SHARED_STATE_MOCK_KEY, GIS_POINT_INFO_KEY } from '@/Control/seatSharedState'
import { MOCK_CALL_LOCATION_ID } from '@/const/const.message.type'

export type SharedCallLocationMock = {
    updatedAt: number
    lng: number
    lat: number
}

/** 契约 §7.2 调派车辆演示摘要（注入型，主契约无车辆承载，纯演示） */
export type SharedDispatchVehicleMock = {
    vehicleId: string
    plateNo?: string
    vehicleTypeName?: string
    stationId?: string
    stationName?: string
}

export type SharedDispatchVehiclesMock = {
    updatedAt: number
    vehicles: SharedDispatchVehicleMock[]
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
 * 解析 §7.2 注入型调派车辆清单：v=1、updatedAt 有效、dispatchVehicles 为数组
 * 且每项 vehicleId 有效；损坏/形状不符 → null 整体忽略。
 */
const parseSharedDispatchVehiclesMock = (raw: string | null): SharedDispatchVehiclesMock | null => {
    if (!raw) return null
    try {
        const mock = JSON.parse(raw)
        if (Number(mock?.v) !== 1) return null
        const updatedAt = Number(mock.updatedAt)
        if (!Number.isFinite(updatedAt)) return null
        if (!Array.isArray(mock.dispatchVehicles) || !mock.dispatchVehicles.length) return null
        const vehicles = mock.dispatchVehicles
            .map((item: Record<string, unknown>): SharedDispatchVehicleMock | null => {
                const vehicleId = typeof item?.vehicleId === 'string' ? item.vehicleId.trim() : ''
                if (!vehicleId) return null
                return {
                    vehicleId,
                    plateNo: typeof item.plateNo === 'string' ? item.plateNo : undefined,
                    vehicleTypeName: typeof item.vehicleTypeName === 'string'
                        ? item.vehicleTypeName : undefined,
                    stationId: typeof item.stationId === 'string' ? item.stationId.trim() : undefined,
                    stationName: typeof item.stationName === 'string' ? item.stationName : undefined,
                }
            })
            .filter((item: SharedDispatchVehicleMock | null): item is SharedDispatchVehicleMock => item !== null)
        return vehicles.length ? { updatedAt, vehicles } : null
    } catch {
        return null
    }
}

/**
 * 解析 seat-shared-state-mock 中的 flood.dispatchCommand 字段（特殊地图车辆模拟触发）。
 * 当 flood 属性存在、flood.dispatchCommand 存在且不为空对象 {} 时触发模拟。
 */
const parseSharedSpecialMapMock = (
    raw: string | null,
): { simulate: boolean; updatedAt: number } | null => {
    if (!raw) return null
    try {
        const mock = JSON.parse(raw)
        if (!Number(mock?.v)) return null
        const updatedAt = Number(mock.updatedAt)
        if (!Number.isFinite(updatedAt)) return null
        const dispatchCommand = mock.flood?.dispatchCommand
        const simulate = !!(dispatchCommand
            && typeof dispatchCommand === 'object'
            && !Array.isArray(dispatchCommand)
            && Object.keys(dispatchCommand).length > 0)
        return { simulate, updatedAt }
    } catch {
        return null
    }
}

/**
 * 解析 seat-shared-state-mock 中的警情二次定位触发。
 * 数据结构：{ v: 1, updatedAt, incidentID, isSecondJQLocation: true, pointInfo: { x, y, address } }
 * 仅 isSecondJQLocation === true 且 incidentID 非空时返回；确认后由地图屏写回 false + pointInfo。
 */
const parseSharedSecondJQLocation = (
    raw: string | null,
): { incidentId: string; updatedAt: number } | null => {
    if (!raw) return null
    try {
        const mock = JSON.parse(raw)
        if (Number(mock?.v) !== 1) return null
        const updatedAt = Number(mock.updatedAt)
        if (!Number.isFinite(updatedAt)) return null
        if (mock.isSecondJQLocation !== true) return null
        const incidentId = String(mock.incidentID ?? '').trim()
        if (!incidentId) return null
        return { incidentId, updatedAt }
    } catch {
        return null
    }
}

/**
 * 解析 seat-shared-state 中的 mode 字段（特殊地图渲染触发）。
 * seat-shared-state 是受理席写入的主状态 blob，mode 携带其中。
 * 仅 mode === "flood" 时触发渲染。
 */
const parseSpecialMapRenderFromSharedState = (
    raw: string | null,
): { render: boolean; updatedAt: number } | null => {
    if (!raw) return null
    try {
        const state = JSON.parse(raw)
        if (Number(state?.v) !== 1) return null
        const updatedAt = Number(state.updatedAt)
        if (!Number.isFinite(updatedAt)) return null
        return {
            render: state.mode === 'flood',
            updatedAt,
        }
    } catch {
        return null
    }
}

/** 特殊地图渲染待消费标志：跨路由导航时暂存，dispatchMap 挂载后消费 */
let pendingSpecialMapRender = false

/** dispatchMap 挂载后消费 pending 标志，返回是否需要触发特殊地图渲染 */
export const consumePendingSpecialMapRender = (): boolean => {
    const pending = pendingSpecialMapRender
    pendingSpecialMapRender = false
    return pending
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

    const emitMockLocateCall = (mock: { updatedAt: number; lng: number; lat: number; address?: string }) => {
        msg.ingest(
            {
                eventKey: MESSAGE_EVENT_KEY.MAP_LOCATE_CALL,
                data: {
                    id: MOCK_CALL_LOCATION_ID,
                    longitude: mock.lng,
                    latitude: mock.lat,
                    radius: 500,
                    Carrier_Loc: mock.address || '', // 模拟来电定位
                },
            },
            MESSAGE_CHANNEL.BROADCAST_CHANNEL,
            MESSAGE_SYSTEM.IDS_SEAT_WEB,
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
            MESSAGE_CHANNEL.BROADCAST_CHANNEL,
            MESSAGE_SYSTEM.IDS_SEAT_WEB,
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

    /**
     * 桥接注入型调派车辆清单（§7.2/§7.3）：解析 blob 中的 dispatchVehicles 后
     * 以 MOCK_DISPATCH_VEHICLES 事件投递，由 DispatchT1 校验队站匹配并触发模拟跟踪。
     * 注入型无"移除补丁"语义（清场后模拟由真实 GPS/取消调派/重置自然停止），
     * raw=null 或解析失败均静默忽略。
     */
    const applyMockDispatchVehicles = (raw: string | null) => {
        const mock = parseSharedDispatchVehiclesMock(raw)
        if (!mock) return
        msg.ingest(
            {
                eventKey: MESSAGE_EVENT_KEY.MOCK_DISPATCH_VEHICLES,
                data: mock.vehicles,
            },
            MESSAGE_CHANNEL.BROADCAST_CHANNEL,
            MESSAGE_SYSTEM.IDS_SEAT_WEB,
            {
                source: SEAT_SHARED_STATE_MOCK_KEY,
                mock: true,
                mockUpdatedAt: mock.updatedAt,
            },
        )
    }

    /**
     * 桥接注入型特殊地图模拟标记：仅处理 flood.dispatchCommand（seat-shared-state-mock）。
     * mode 字段在 seat-shared-state，由 applySpecialMapRenderFromSharedState 处理。
     */
    const applyMockSpecialMap = (raw: string | null) => {
        const mock = parseSharedSpecialMapMock(raw)
        if (!mock) return
        if (mock.simulate) {
            msg.ingest(
                {
                    eventKey: MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_SIMULATE,
                    data: null,
                },
                MESSAGE_CHANNEL.BROADCAST_CHANNEL,
                MESSAGE_SYSTEM.IDS_SEAT_WEB,
                {
                    source: SEAT_SHARED_STATE_MOCK_KEY,
                    mock: true,
                    mockUpdatedAt: mock.updatedAt,
                },
            )
        }
    }

    /**
     * 处理 seat-shared-state 中的 mode 字段：
     * - 仅 mode === "flood" 时触发
     * - 设 pending 标志（供跨路由导航后 dispatchMap 消费）
     * - 直接投 MOCK_SPECIAL_MAP_RENDER（当前已在 /dispatch1 时立即生效）
     * 返回是否真正触发，调用方据此决定是否需要导航。
     */
    const applySpecialMapRenderFromSharedState = (raw: string | null): boolean => {
        const parsed = parseSpecialMapRenderFromSharedState(raw)
        if (!parsed || !parsed.render) return false
        pendingSpecialMapRender = true
        msg.ingest(
            {
                eventKey: MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_RENDER,
                data: null,
            },
            MESSAGE_CHANNEL.BROADCAST_CHANNEL,
            MESSAGE_SYSTEM.IDS_SEAT_WEB,
            {
                source: SEAT_SHARED_STATE_KEY,
                mock: true,
                mockUpdatedAt: parsed.updatedAt,
            },
        )
        return true
    }

    /**
     * 退出特灾模式：投 MOCK_SPECIAL_MAP_CLEAR，dispatchMap 清除特殊地图上图数据。
     */
    const applySpecialMapExit = (): void => {
        msg.ingest(
            {
                eventKey: MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_CLEAR,
                data: {},
            },
            MESSAGE_CHANNEL.BROADCAST_CHANNEL,
            MESSAGE_SYSTEM.IDS_SEAT_WEB,
            { source: 'mock-special-map-exit', mock: true },
        )
    }

    /**
     * 桥接注入型特殊地图灾害点标记：仅处理 disasterSite（seat-shared-state-mock）。
     * mode=flood 已触发清空，此处 disasterSite 有值时执行渲染。
     */
    const applyMockDisasterSite = (raw: string | null) => {
        if (!raw) return
        try {
            const mock = JSON.parse(raw)
            if (!Number(mock?.v)) return
            const disasterSite = mock.disasterSite
            const hasValue = disasterSite !== undefined
                && disasterSite !== null
                && (typeof disasterSite !== 'object' || Object.keys(disasterSite).length > 0)
            if (!hasValue) return
            msg.ingest(
                {
                    eventKey: MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_DISASTER_SITE,
                    data: { disasterSite },
                },
                MESSAGE_CHANNEL.BROADCAST_CHANNEL,
                MESSAGE_SYSTEM.IDS_SEAT_WEB,
                { source: SEAT_SHARED_STATE_MOCK_KEY, mock: true },
            )
        } catch { /* ignore */ }
    }

    /**
     * 桥接警情二次定位触发（seat-shared-state-mock 的 secondJQLocation 字段）。
     * 解析出 incidentId 后投递 MOCK_INCIDENT_RELOCATE 事件，
     * 由 dispatchMap 订阅后激活地图选点交互。
     */
    const applyMockSecondJQLocation = (raw: string | null) => {
        const parsed = parseSharedSecondJQLocation(raw)
        if (!parsed) return
        msg.ingest(
            {
                eventKey: MESSAGE_EVENT_KEY.MOCK_INCIDENT_RELOCATE,
                data: { incidentId: parsed.incidentId },
            },
            MESSAGE_CHANNEL.BROADCAST_CHANNEL,
            MESSAGE_SYSTEM.IDS_SEAT_WEB,
            {
                source: GIS_POINT_INFO_KEY,
                mock: true,
                mockUpdatedAt: parsed.updatedAt,
            },
        )
    }

    return {
        applyMockCallLocation,
        applyMockDispatchVehicles,
        applyMockSpecialMap,
        applySpecialMapRenderFromSharedState,
        applySpecialMapExit,
        applyMockDisasterSite,
        applyMockSecondJQLocation,
    }
}
