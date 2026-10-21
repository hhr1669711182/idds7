/*
 * @Description: 资源 URL 解析工具 —— 路径常量层的运行时兜底与加载辅助。
 * @FilePath: src/utils/assetUrl.ts
 *
 * 配套 herness/02-技术设计/前端/资源文件管理-技术方案.md 的 R2 铁律：
 * 迁移批次 B2 完成后，硬编码路径应全部改为引用 @/const/assetPaths；
 * resolveAssetUrl 仅作为过渡期兜底，B3 完成后应评估删除。
 */
import { ABSOLUTE_URL_PATTERN, withAssetBase } from '@/const/assetPaths'
import { appEnv } from '@/config/env'

import { createLogger } from './logger'

const logger = createLogger('utils/assetUrl')

/**
 * 把资源路径解析成可请求的 URL。
 * 绝对协议 URL（http/https/data/blob）与协议相对 URL（//）原样返回，其余按 base 归一拼接。
 */
export const resolveAssetUrl = (path: string, base: string = appEnv.assetBase): string => {
  if (!path) return ''
  if (ABSOLUTE_URL_PATTERN.test(path)) return path
  return withAssetBase(base, path)
}

/**
 * 加载 JSON 资源并安全解析。
 * 失败（HTTP 错误或 JSON 语法错误）一律返回 null，由调用方按缺省处理，不向上抛错。
 */
export const loadJsonAsset = async <T>(url: string): Promise<T | null> => {
  const requestUrl = resolveAssetUrl(url)

  try {
    const response = await fetch(requestUrl)
    if (!response.ok) {
      logger.warn(`JSON 资源加载失败：${requestUrl}（HTTP ${response.status}）`)
      return null
    }
    return (await response.json()) as T
  } catch (error) {
    logger.warn(`JSON 资源加载异常：${requestUrl}`, { error })
    return null
  }
}

/**
 * 探测资源是否存在，用于 3D 模型等加载失败时的降级提示。
 * 任何非 2xx 或网络异常都判定为缺失，避免把不确定状态当成可用。
 */
export const isAssetMissing = async (url: string): Promise<boolean> => {
  const requestUrl = resolveAssetUrl(url)

  try {
    const response = await fetch(requestUrl, { method: 'HEAD' })
    return !response.ok
  } catch {
    return true
  }
}
