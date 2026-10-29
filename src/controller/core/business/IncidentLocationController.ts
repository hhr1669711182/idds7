import { watch, type WatchStopHandle } from 'vue'
import { useIncidentLocationStore } from '@/store/useIncidentLocationStore'
import { useUserStore } from '@/store/useUserStore'
import { useVehicleTrackStore } from '@/store/useVehicleTrackStore'
import { isTerminalIncidentState } from '@/utils/incidentState'
import { readIncidentLocationContext } from '@/utils/incidentLocation'
import { getSharedMapStage } from '@/utils/seatSharedState'
import type { MessageEnvelope } from '@/types/message'
import type { BusinessMapPort } from '@/controller/core/protocol/BusinessMapPort'
import type {
  AddressUpdatedData,
  IncidentLocationAcceptance,
  IncidentLocationRenderingPort,
  IncidentLocationSharedState,
} from '@/controller/core/protocol/IncidentLocationProtocol'

export class IncidentLocationController {
  private readonly store = useIncidentLocationStore()
  private readonly stopContext: WatchStopHandle
  private disposed = false

  constructor(private readonly port?: BusinessMapPort | IncidentLocationRenderingPort) {
    const user: IncidentLocationSharedState = useUserStore()
    this.stopContext = watch(
      () => user.sharedStateRevision,
      () => {
        if (user.sessionEpoch === undefined && user.rawState === undefined && user.currentAlarm === undefined) return
        this.store.setContext(readIncidentLocationContext(user, getSharedMapStage(user.rawState, user.MapMode)))
      },
      { immediate: true, flush: 'sync' },
    )
  }

  receive(envelope: MessageEnvelope<AddressUpdatedData>): IncidentLocationAcceptance {
    if (this.disposed) return { accepted: false, reason: 'disposed' }
    // 终态警情不再执行原有警情上图（主管队站/周边资源/路径规划），并清空已渲染结果；
    // 消息未带 incidentId 时无法比对，改为按持久化终态标记是否存在兜底拦截。
    const trackStore = useVehicleTrackStore()
    const messageIncidentId = String(envelope.data?.incidentId ?? '').trim()
    const terminalMarked =
      Boolean(String(trackStore.terminalIncidentId ?? '').trim()) && isTerminalIncidentState(trackStore.terminalState)
    if (
      (messageIncidentId && trackStore.isTerminalIncident(messageIncidentId)) ||
      (!messageIncidentId && terminalMarked)
    ) {
      this.store.clearAll()
      return { accepted: false, reason: 'terminal' }
    }
    const result = this.store.onAddressUpdated(envelope)
    console.log('IncidentLocationController.receive accepted:', result.accepted, result)
    if (result.accepted && this.port && 'onIncidentLocationAccepted' in this.port) {
      this.port.onIncidentLocationAccepted?.(result)
    }
    return result
  }

  onAddressUpdated(envelope: MessageEnvelope<AddressUpdatedData>): IncidentLocationAcceptance {
    return this.receive(envelope)
  }

  reset(): void {
    this.store.clearAll()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stopContext()
  }
}
