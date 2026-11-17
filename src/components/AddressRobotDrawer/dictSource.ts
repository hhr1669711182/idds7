import { ref } from 'vue'
import { createLogger } from '@/utils/logger'
import { displayLabels, type AddressDict, type AddressDictSource } from './types'

const logger = createLogger('AddressRobotDrawer')

/** 本地默认源：直接返回内置基线字典，离线或接口未就绪时兜底 */
export const localAddressDictSource: AddressDictSource = {
  load: async () => displayLabels,
}

// 预留：HTTP 动态源。正式字典接口就绪后取消本段注释，并把下方 activeAddressDictSource 指向它即可，组件侧无需改动。
// 取消注释时需补充：
//   import { getDictMethod } from '@/apis/common'
//   import type { AddressDictGroup } from './types'
// 各组 dict type 命名需与后端对齐；此处先以字典组名直用（status/anchorType/...），确认后可替换为带前缀的 type。
// const httpAddressDictSource: AddressDictSource = {
//   load: async () => {
//     const groups = Object.keys(displayLabels)
//     const remote: AddressDict = {}
//     await Promise.all(
//       groups.map(async (group) => {
//         const items = await getDictMethod(group).send()
//         const map: Record<string, string> = {}
//         for (const item of items ?? []) map[String(item.value)] = item.label
//         remote[group] = map
//       }),
//     )
//     // 远端缺组/空组时保留本地基线，避免标签空白
//     for (const group of groups) {
//       if (!Object.keys(remote[group] ?? {}).length) remote[group] = displayLabels[group as AddressDictGroup]
//     }
//     return remote
//   },
// }

/** 当前生效的字典源：接口未就绪默认本地；正式接口就绪后切换此引用 */
export const activeAddressDictSource: AddressDictSource = localAddressDictSource

const dict = ref<AddressDict>(displayLabels)
const ready = ref(false)

/** 拉取 activeAddressDictSource 并替换响应式字典；失败/空则保留本地基线，绝不白屏 */
export const hydrateAddressDict = async () => {
  try {
    const loaded = await activeAddressDictSource.load()
    if (loaded && Object.keys(loaded).length) dict.value = loaded
    ready.value = true
  } catch (err) {
    logger.error('地址机器人字典加载失败，回落本地基线', err)
  }
}

/**
 * 响应式字典解析器：dict 初值为本地基线（同步可读），远端到达后替换并自动重渲染。
 * 模板/ computed 调用 resolve(group, key, fallback) 即可，语义与原 label() 一致。
 */
export const useAddressDict = () => {
  const resolve = (group: string, key?: string, fallback = '—') =>
    key ? dict.value[group]?.[key] ?? fallback : fallback
  return { dict, ready, resolve }
}
