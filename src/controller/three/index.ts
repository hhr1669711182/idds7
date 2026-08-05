import { useMessageStore } from '@/store/useMessageStore'
import {
    MESSAGE_CHANNEL,
    MESSAGE_EVENT_KEY,
    MESSAGE_SYSTEM,
} from '@/const/const.message.type'

export const onLoadModel = (handler: (data: any) => void) => {
    const store = useMessageStore()
    return store.subscribe(MESSAGE_EVENT_KEY.THREE_LOAD_MODEL, (envelope) => {
        handler(envelope.data)
    })
}



// 回传业务数据
export const threeCtrl = {
    // 建筑物模型表单数据回传
    buildFormSend(data: any) {
        useMessageStore().publish(MESSAGE_EVENT_KEY.THREE_BUILD_FORM_SEND, data, {
            system: MESSAGE_SYSTEM.THREE,
            channel: MESSAGE_CHANNEL.WS,
        })
    },
}