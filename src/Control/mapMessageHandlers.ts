import { usePendingDispatchAlarmStore } from '@/store/usePendingDispatchAlarmStore'//调派状态引用
import { usePendingCallLocationStore } from '@/store/usePendingCallLocationStore'//来电定位延迟重发状态
import { useIncidentLocationStore } from '@/store/useIncidentLocationStore'//警情定位（画像地址变更）
import type { LocateCallData } from '@/controller/core/protocol'

import type { MessageEnvelope } from '@/types/message'
import {
    toDispatchAlarmProfile,
    type AlarmIncidentStateData,
} from '@/Control/alarmMessage'
import {
    type AlarmCallAnswerStatusData,
} from '@/Control/alarmCallMessage'
import {
    type AddressUpdatedData,
    createAddressUpdatedCache,
} from '@/Control/incidentLocationMessage'
import {
    PAGE_CONDITION,
    clearPageCondition,
    navigateByCondition,
    setPageCondition,
} from '@/Control/pageCondition'


/** 地图业务消息处理；由初始化模块注册，状态按实例隔离。 */
export const createMapMessageHandlers = () => {
    const pendingDispatchAlarm = usePendingDispatchAlarmStore()
    const pendingCallLocation = usePendingCallLocationStore()
    const incidentLocationStore = useIncidentLocationStore()
    // 同阶段内 slotChanges 为增量推送，需按画像合并缓存后再进入 store 流程
    const addressCache = createAddressUpdatedCache()
    const handledAlarmEventIds = new Set<string>()
    // 当前活跃画像 key（incidentId/disasterProfileId/eventId），切换警情时先 clearAll 再上图
    let lastActiveKey = ''

    const openDispatch1 = (profile: Record<string, any>) => {
        // 先交付消息，再统一切页，避免 replace/push 并发取消导航。
        pendingDispatchAlarm.queue(profile)
        console.info('[alarm-message] 立案画像已缓存，等待地图接收', {
            incidentId: profile.incidentId,
        })
        void setPageCondition(PAGE_CONDITION.DISPATCH, 'alarm.message')
    }

    const onAlarmProfileSync = (envelope: MessageEnvelope) => {
        openDispatch1(envelope.data ?? {})
    }

    const onLocateCall = (envelope: MessageEnvelope) => {
        pendingCallLocation.queue(envelope.data as LocateCallData)
        clearPageCondition()
        void navigateByCondition(PAGE_CONDITION.REQUEST)
    }

    const onLocateCallRemove = (_envelope: MessageEnvelope) => {
        // 来电结束不再提前清除粗定位；进入 dispatch 后仍需保留，
        // 直到 ADDRESS_UPDATED 的 slotChanges 给出有效经纬度。
    }

    /** 警情状态变更 */
    const onCallAnswerStatusChanged = (envelope: MessageEnvelope) => {
        const data = envelope.data as AlarmCallAnswerStatusData
        const isAnswered = data?.answered === true
            && String(data?.newState ?? '').toUpperCase() === 'ANSWERED'
            && data?.ended !== true

        if (isAnswered) {
            void setPageCondition(PAGE_CONDITION.REQUEST, 'alarm.call.answer_status_changed')
            return
        }

        clearPageCondition()
        void navigateByCondition(PAGE_CONDITION.REQUEST)
    }

    const onIncidentStateChanged = (envelope: MessageEnvelope) => {
        const alarmState = envelope.data as AlarmIncidentStateData
        if (String(alarmState?.newState ?? '').toUpperCase() !== 'CREATED') {
            console.info('[alarm-message] 跳过非立案状态', { newState: alarmState?.newState })
            return
        }

        const eventId = String(envelope.meta?.eventId ?? '')
        if (eventId && handledAlarmEventIds.has(eventId)) return
        if (eventId) {
            handledAlarmEventIds.add(eventId)
            if (handledAlarmEventIds.size > 200) {
                const oldestEventId = handledAlarmEventIds.values().next().value
                if (oldestEventId) handledAlarmEventIds.delete(oldestEventId)
            }
        }

        const profile = toDispatchAlarmProfile(
            alarmState,
        )
        console.info('[alarm-message] 立案消息已进入地图处理', {
            incidentId: alarmState.incidentId,
            hasCoordinates: Number.isFinite(profile.longitude) && Number.isFinite(profile.latitude),
        })
        if (!Number.isFinite(profile.longitude) || !Number.isFinite(profile.latitude)) {
            console.warn(
                '[alarm-message] 状态通知没有坐标，需通过警情 HTTP 接口刷新快照',
                envelope.data,
            )
        }
        openDispatch1(profile)
    }

    const onAddressUpdated = (envelope: MessageEnvelope<AddressUpdatedData>) => {
        if (!envelope.data) {
            incidentLocationStore.onAddressUpdated(envelope)
            return
        }
        // HTTP 全量快照（id 以 profile-sync- 开头）直接替换缓存，不与旧快照合并，
        // 避免已被清空的 slot 残留旧值；WS 增量消息走 merge 补齐未变更属性后再下发
        const isHttpFullSnapshot = String(envelope.id ?? '').startsWith('profile-sync-')
        const merged = isHttpFullSnapshot
            ? addressCache.replace(envelope.data)
            : addressCache.merge(envelope.data)
        // 切换警情（key 变化）：先清除上一次的显示结果（点位/辖区/队站过滤/路径/版本号），
        // 再上图本次消息，避免不同警情的点位/辖区并存。
        const key = String(merged.incidentId || merged.disasterProfileId || merged.eventId || '').trim()
        if (key && key !== lastActiveKey) {
            lastActiveKey = key
            incidentLocationStore.clearAll()
        }
        incidentLocationStore.onAddressUpdated({
            ...envelope,
            data: merged,
        })
    }

    return {
        onAlarmProfileSync,
        onLocateCall,
        onLocateCallRemove,
        onCallAnswerStatusChanged,
        onIncidentStateChanged,
        onAddressUpdated,
        reset: () => {
            handledAlarmEventIds.clear()
            addressCache.reset()
            lastActiveKey = ''
        },
        dispose: () => addressCache.dispose(),
    }
}
