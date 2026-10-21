/*
 * @Author: hhr
 * @Date: 2026-07-01 11:10:53
 * @LastEditTime: 2026-07-06 16:47:16
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\controller\core\business\AlarmController.ts
 */
import type { BusinessMapPort } from '../protocol/BusinessMapPort'
import type { AlarmProfileSyncData } from '../protocol'
import type { AlarmIncidentStateData } from '../protocol/LegacyMessageProtocol'
import type { MessageEnvelope } from '@/types/message'
import { toDispatchAlarmProfile } from '@/utils/alarmProfile'
import { usePendingDispatchAlarmStore } from '@/store/usePendingDispatchAlarmStore'
import { useUserStore } from '@/store/useUserStore'
import { PAGE_CONDITION, setPageCondition } from '@/register/pageCondition'

export class AlarmController {
  private handledEvents = new Set<string>()
  constructor(private genericController: BusinessMapPort) {}

  private get contextKey() {
    const user = useUserStore()
    return JSON.stringify([user.userId, user.sessionId, user.seatNumber])
  }

  /**
   * [EC-05-2] 警情精确上图控制 / 警情画像状态更新
   */
  public syncAlarmProfile(data: AlarmProfileSyncData) {
    usePendingDispatchAlarmStore().queue(data, this.contextKey)
    void setPageCondition(PAGE_CONDITION.DISPATCH, 'alarm.profile.sync')
  }

  public incidentStateChanged(envelope: MessageEnvelope<AlarmIncidentStateData>) {
    if (String(envelope.data?.newState ?? '').toUpperCase() !== 'CREATED') return
    const eventId = String(envelope.meta?.eventId ?? '')
    if (eventId && this.handledEvents.has(eventId)) return
    if (eventId) {
      this.handledEvents.add(eventId)
      if (this.handledEvents.size > 200) this.handledEvents.delete(this.handledEvents.values().next().value!)
    }
    usePendingDispatchAlarmStore().queue(toDispatchAlarmProfile(envelope.data), this.contextKey)
    void setPageCondition(PAGE_CONDITION.DISPATCH, 'alarm.message')
  }

  public reset() {
    this.handledEvents.clear()
  }

  public renderAlarmProfile(data: AlarmProfileSyncData) {
    const { view, geometry } = this.genericController

    if (data.longitude && data.latitude) {
      view.locate({
        lngLat: [data.longitude, data.latitude],
        zoom: 18,
        duration: 800,
      })

      geometry.addMarker({
        id: data.incidentId,
        lngLat: [data.longitude, data.latitude],
        // iconUrl: '/icons/fire.png',
        iconType: 'endpoint',
        iconParams: {
          type: 'alarm',
        },
        animate: 'breathe',
      })
    }
  }
}
