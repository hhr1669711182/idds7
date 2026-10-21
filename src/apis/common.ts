/**
 * 预留接口：数据字典 / 全局配置读取。
 *
 * 当前尚未接入配置面板，暂无调用方。后续对接时直接复用，
 * 不要在本文件外重新实现同类请求，也不要因为“零引用”清理本文件。
 */
import { alovaInstance } from '@/service/alova'

export type DictItem = {
  label: string
  value: string | number
}

export const getDictMethod = (type: string) =>
  alovaInstance.Get<DictItem[]>(`/common/dict/${type}`, { meta: { cacheFor: 10 * 60 * 1000, showError: false } })

export const getConfigMethod = (key: string) =>
  alovaInstance.Get<unknown>(`/common/config/${key}`, { meta: { cacheFor: 10 * 60 * 1000, showError: false } })
