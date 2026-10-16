/**
 * 共享状态的一次性订阅器：依赖 useUserStore，不属于纯转换层。
 * seatSharedState.ts 保持零 store 依赖，避免 store ↔ utils 循环引用。
 */
import { watch } from 'vue'
import { useUserStore } from '@/store/useUserStore'
import { getSharedMapStage } from './seatSharedState'

/** 当前已是 dispatchTrack 时同步执行，否则等下一次共享态提交；返回取消函数。 */
export const whenDispatchTrack = (
  callback: () => void,
  options: { userStore?: ReturnType<typeof useUserStore> } = {},
): (() => void) => {
  const store = options.userStore ?? useUserStore()
  if (getSharedMapStage(store.rawState, store.MapMode) === 'dispatchTrack') {
    callback()
    return () => {}
  }
  const epoch = store.sessionEpoch
  const stop = watch(
    () => store.sharedStateRevision,
    () => {
      if (store.sessionEpoch !== epoch || store.rawState?.auth === null) {
        stop()
        return
      }
      if (getSharedMapStage(store.rawState, store.MapMode) !== 'dispatchTrack') return
      stop()
      callback()
    },
    { flush: 'sync' },
  )
  return stop
}
