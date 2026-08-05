import { alovaInstance } from '../alova'

export type DictItem = {
  label: string
  value: string | number
}

export const getDictMethod = (type: string) =>
  alovaInstance.Get<DictItem[]>(
    `/common/dict/${type}`,
    { meta: { cacheFor: 10 * 60 * 1000, showError: false } }
  )

export const getConfigMethod = (key: string) =>
  alovaInstance.Get<unknown>(
    `/common/config/${key}`,
    { meta: { cacheFor: 10 * 60 * 1000, showError: false } }
  )
