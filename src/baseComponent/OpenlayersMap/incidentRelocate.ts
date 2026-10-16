/*
 * @Description: 警情二次定位模块（BroadcastChannel 版，对接受理席 gis-point-selection 协议 V1.0）。
 *               受理席经 BroadcastChannel('ids-gis-point-selection') 发 PICK_START，
 *               地图收到后激活选点交互（OpenLayers Draw Point）；
 *               鼠标松开（drawend）后弹出确认弹窗：
 *               - 点击"是"：逆地址解析获取 address，经 BroadcastChannel 回发 PICK_RESULT
 *                 （含 pointInfo 坐标/地址），1.5s 重试直至收到 ACK；
 *                 并用新坐标执行原 dispatch 阶段警情定位流程；
 *               - 点击"否"：清除已绘点，继续选点。
 * @FilePath: \ids-gis-web\src\baseComponent\OpenlayersMap\incidentRelocate.ts
 */
import { markRaw } from 'vue'
import { Draw } from 'ol/interaction'
import { transform } from 'ol/proj'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style'
import type OlMap from 'ol/Map'
import { ElMessageBox } from 'element-plus'
import { useIncidentLocationStore } from '@/store/useIncidentLocationStore'
import { useMessageStore } from '@/store/useMessageStore'
import type { MessageEnvelope } from '@/types/message'
import type { AddressUpdatedData } from '@/controller/core/protocol/IncidentLocationProtocol'
import type { AmapRealtimeNav } from '@/baseComponent/amap/useAmapTools'
import { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } from '@/const/const.message.type'
import { getGisPointChannel } from '@/composables/useGisPointSelection'

const RELOCATE_SKETCH_LAYER_CLASS = 'incident-relocate-sketch'
const RELOCATE_SKETCH_Z_INDEX = 9999

export type IncidentRelocate = {
  start: (incidentId: string, token?: RelocateToken) => void
  stop: () => void
  dispose: () => void
}

/** 与受理席 gis-point-selection 协议的关联标识 */
export type RelocateToken = {
  ownerId: string
  requestId: string
}

/**
 * 创建警情二次定位实例。需在地图实例就绪后调用（dispatchMap 初始化阶段）。
 * - start(incidentId)：激活选点交互
 * - stop()：移除交互并清空临时绘制图层
 * - dispose()：销毁实例，移除临时图层
 */
export const createIncidentRelocate = (mapInstance: OlMap, nav: AmapRealtimeNav): IncidentRelocate => {
  const incidentLocationStore = useIncidentLocationStore()
  const msg = useMessageStore()
  const gisChannel = getGisPointChannel()
  let draw: Draw | null = null
  let sketchLayer: VectorLayer<VectorSource> | null = null
  let activeIncidentId: string | null = null
  let activeToken: RelocateToken | null = null
  let isConfirming = false
  let resultRetryTimer: ReturnType<typeof setInterval> | null = null
  /** 待确认弹窗是否打开（受理席 ACK/取消到达时需强制关闭） */
  let hasPendingConfirm = false

  /** 懒初始化临时绘制图层（选点标记） */
  const ensureSketchLayer = () => {
    if (sketchLayer) return
    const source = markRaw(new VectorSource({ wrapX: false }))
    sketchLayer = markRaw(
      new VectorLayer({
        source,
        className: RELOCATE_SKETCH_LAYER_CLASS,
        zIndex: RELOCATE_SKETCH_Z_INDEX,
        style: new Style({
          image: new CircleStyle({
            radius: 8,
            fill: new Fill({ color: '#1890ff' }),
            stroke: new Stroke({ color: '#fff', width: 2 }),
          }),
        }),
      }),
    )
    mapInstance.addLayer(sketchLayer)
  }

  /** 清空临时绘制图层上的所有选点 */
  const clearSketch = () => {
    sketchLayer?.getSource()?.clear()
  }

  /** 停止选点：移除 Draw 交互、清空临时图层、关闭待确认弹窗、重置状态 */
  const stop = () => {
    if (resultRetryTimer) {
      clearInterval(resultRetryTimer)
      resultRetryTimer = null
    }
    // 若确认弹窗仍打开（受理席取消/ACK 到达打断选点），强制关闭，避免用户误点"是"继续提交
    if (hasPendingConfirm) {
      hasPendingConfirm = false
      try {
        ElMessageBox.close()
      } catch {
        /* ignore */
      }
    }
    if (draw) {
      mapInstance.removeInteraction(draw)
    }
    draw = null
    clearSketch()
    activeIncidentId = null
    activeToken = null
    isConfirming = false
  }

  /**
   * 回传受理席：经 BroadcastChannel 发送 PICK_RESULT（gis-point-selection 协议）。
   * 1.5s 重试直至收到 ACK（APPLIED/FAILED/CANCEL 由 gisPointChannel 统一处理并停止重试）。
   */
  const sendPickResult = (token: RelocateToken, incidentId: string, lng: number, lat: number, address: string) => {
    const pointInfo = { x: String(lng), y: String(lat), address }
    const send = () => {
      try {
        gisChannel.send({
          v: 1,
          type: 'PICK_RESULT',
          source: 'gis',
          ownerId: token.ownerId,
          requestId: token.requestId,
          incidentID: incidentId,
          sentAt: Date.now(),
          pointInfo,
        })
      } catch (error) {
        console.warn('[incident-relocate] PICK_RESULT 发送失败', error)
      }
    }
    send()
    resultRetryTimer = setInterval(send, 1500)
    console.info('[incident-relocate] 已发送 PICK_RESULT', { incidentId, lng, lat, address })
  }

  /**
   * 执行原 dispatch 阶段警情定位流程：构造 AddressUpdatedData，经 msg.ingest 投递
   * 到 DISASTER_PROFILE_ADDRESS_UPDATED 事件，复用 handlers.onAddressUpdated 的
   * 完整链路（切换警情 clearAll 清除旧点位/圆 + addressCache 合并 + store.onAddressUpdated
   * 的 upsertMarker 点位更新/定位飞行 + fetchJurisdiction 重查辖区/队站/圆）。
   * version 取当前已处理版本 +1，避免被版本去重拦截。
   * 必须走 handlers 而非直接调 store：直接调 store 会跳过 clearAll，
   * 导致上一次（如 WS ADDRESS_UPDATED 路径）的点位和圆残留，且新点位圆不显示。
   */
  const executeDispatchLocationFlow = (incidentId: string, lng: number, lat: number, address: string | null) => {
    const currentVersion = incidentLocationStore.versions[incidentId]
    const nextVersion = typeof currentVersion === 'number' && currentVersion > 0 ? currentVersion + 1 : 1

    const envelope: MessageEnvelope<AddressUpdatedData> = {
      id: `relocate-${incidentId}-${Date.now()}`,
      timestamp: Date.now(),
      channel: MESSAGE_CHANNEL.BROADCAST_CHANNEL,
      system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
      eventKey: MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
      data: {
        incidentId,
        longitude: lng,
        latitude: lat,
        address,
        primaryStationId: null,
        version: nextVersion,
        slots: {
          longitude: String(lng),
          latitude: String(lat),
          // slots 中显式携带 disaster_address 才会更新点位地址（沿用旧值防冲空的既有逻辑）
          ...(address ? { disaster_address: address } : {}),
        },
      },
    }
    // 经 ingest 投递：走阶段门控 → handlers.onAddressUpdated（clearAll + addressCache）→ store.onAddressUpdated
    msg.ingest(envelope, MESSAGE_CHANNEL.BROADCAST_CHANNEL, MESSAGE_SYSTEM.IDS_SEAT_WEB, {
      source: 'incident-relocate',
    })
  }

  /**
   * 激活选点交互：创建 Point 类型 Draw，drawend 时弹出确认弹窗。
   * 若上一次选点仍在进行中，先 stop 再启动。
   * token 存在时按 gis-point-selection 协议回发 PICK_READY / PICK_RESULT / PICK_PONG。
   */
  const start = (incidentId: string, token?: RelocateToken) => {
    stop()
    activeIncidentId = incidentId
    activeToken = token ?? null
    ensureSketchLayer()

    // BroadcastChannel 协议模式：发送 PICK_READY 并注册 ACK 回调
    if (activeToken && activeIncidentId) {
      gisChannel.send({
        v: 1,
        type: 'PICK_READY',
        source: 'gis',
        ownerId: activeToken.ownerId,
        requestId: activeToken.requestId,
        incidentID: activeIncidentId,
        sentAt: Date.now(),
      })
      // 受理席 ACK：PICK_APPLIED / PICK_FAILED / PICK_CANCEL 均终止当前选点
      // （含绘制中的选点交互与待确认弹窗）；其中 PICK_CANCEL 即受理席取消二次定位
      gisChannel.onAck((ack) => {
        console.info('[incident-relocate] 收到受理席 ACK，终止选点', ack.type)
        stop()
      })
      console.info('[incident-relocate] 已发送 PICK_READY', { incidentId })
    }

    const source = sketchLayer!.getSource()!
    draw = markRaw(new Draw({ source, type: 'Point' }))
    draw.on('drawend', (e: any) => {
      // 确认弹窗期间的 drawend 事件忽略（模态弹窗已阻断地图交互，此为兜底）
      if (isConfirming) return
      const geom = e.feature?.getGeometry()
      if (!geom) return
      const coord = geom.getFirstCoordinate()
      const [lng, lat] = transform(coord, mapInstance.getView().getProjection(), 'EPSG:4326')
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return

      isConfirming = true
      hasPendingConfirm = true
      ElMessageBox.confirm(
        `确定将警情定位到此位置吗？\n经度: ${lng.toFixed(6)}\n纬度: ${lat.toFixed(6)}`,
        '警情二次定位',
        { confirmButtonText: '是', cancelButtonText: '否', type: 'info' },
      )
        .then(async () => {
          // 点击"是"：逆地址解析 → 回传受理席 → 执行原 dispatch 阶段警情定位流程
          hasPendingConfirm = false
          if (activeIncidentId) {
            // 逆地址解析失败不阻断定位流程，地址置空
            const address = await nav.reverseGeocode([lng, lat]).catch(() => null)
            if (activeToken) {
              sendPickResult(activeToken, activeIncidentId, lng, lat, address ?? '')
            }
            executeDispatchLocationFlow(activeIncidentId, lng, lat, address)
          }
          stop()
        })
        .catch(() => {
          // 点击"否"（或被受理席 ACK/取消强制关闭）：清除已绘点，继续选点
          hasPendingConfirm = false
          clearSketch()
          isConfirming = false
        })
    })
    mapInstance.addInteraction(draw)
    console.info('[incident-relocate] 已启动选点模式', { incidentId })
  }

  /** 销毁实例：停止交互并移除临时图层 */
  const dispose = () => {
    stop()
    if (sketchLayer) {
      mapInstance.removeLayer(sketchLayer)
      sketchLayer = null
    }
  }

  return { start, stop, dispose }
}
