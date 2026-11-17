// 用途：通用 GeoServer WFS 分页 composable，封装列表滚动逐页加载的完整状态机。
// 适用场景：任意需要按页拉取 GeoServer WFS 要素的前端模块（资源检索、消防资源等）。
// 设计原则：纯数据层，不持有 OL 实例，不含 UI 逻辑。
// 基于 WFS 2.0.0 的 startIndex + count 标准分页参数；内部用 generation 机制丢弃过期响应。

import { onUnmounted, shallowRef, type ShallowRef } from 'vue'
import { geoserverApi } from '@/apis/geoserver'
import type { WfsFeature, WfsFeatureCollection } from '@/apis/geoserverTypes'

/** 分页拉取参数 */
export type UseWfsPaginationOptions = {
  /** 图层名，标准形式 `workspace:layer` */
  typeName: string
  /** CQL 过滤条件（可选），随每次请求透传；可通过 resetWithFilter 动态更新 */
  cqlFilter?: string
  /** 工作空间名（缺省时从 typeName 推导） */
  workspace?: string
  /** 每页大小，默认 100 */
  pageSize?: number
  /** 坐标参考系（WFS 2.0.0 标准 crs 参数），默认 'EPSG:4326' */
  crs?: string
  /** 属性裁剪（逗号分隔） */
  propertyName?: string
}

/** useWfsPagination 返回值（响应式字段为 ShallowRef，避免 UnwrapRef 泛型展开报错） */
export type UseWfsPaginationReturn<TProperties = Record<string, unknown>> = {
  /** 已累积的要素列表（跨页追加；resetWithFilter/loadInitial 时清空重填） */
  items: ShallowRef<WfsFeature<TProperties>[]>
  /** 命中总数（来自 numberMatched / totalFeatures） */
  totalCount: ShallowRef<number>
  /** 当前已加载偏移量（即下一页的 startIndex） */
  startIndex: ShallowRef<number>
  /** 是否还有更多数据 */
  hasMore: ShallowRef<boolean>
  /** 是否正在加载中 */
  loading: ShallowRef<boolean>
  /** 本次请求是否因网络或 GeoServer 异常而失败 */
  error: ShallowRef<boolean>
  /** 加载第一页（startIndex 重置为 0，清空已有 items） */
  loadInitial: () => Promise<void>
  /** 加载下一页（startIndex 累加 pageSize）；hasMore 为 false 或 loading 中时静默返回 */
  loadMore: () => Promise<void>
  /** 带新 CQL 过滤条件重置并重新加载第一页 */
  resetWithFilter: (newFilter: string) => Promise<void>
}

/**
 * 通用 WFS 分页 composable。
 *
 * 用法：
 * ```ts
 * const { items, hasMore, loading, loadInitial, loadMore } = useWfsPagination({
 *   typeName: 'gis:view_res_org_dept',
 *   cqlFilter: cql,
 *   pageSize: 100,
 * })
 * await loadInitial()
 * // 列表滚动到底时：
 * await loadMore()
 * ```
 */
export const useWfsPagination = <TProperties = Record<string, unknown>>(
  options: UseWfsPaginationOptions,
): UseWfsPaginationReturn<TProperties> => {
  const pageSize = options.pageSize ?? 100
  const crs = options.crs ?? 'EPSG:4326'

  const items = shallowRef<WfsFeature<TProperties>[]>([])
  const totalCount = shallowRef(0)
  const startIndex = shallowRef(0)
  const hasMore = shallowRef(true)
  const loading = shallowRef(false)
  const error = shallowRef(false)

  // 内部非响应式状态
  let generation = 0
  let cqlFilter = options.cqlFilter

  const fetchPage = async (isReset: boolean): Promise<void> => {
    if (loading.value) return
    const gen = ++generation
    loading.value = true
    error.value = false

    try {
      const offset = isReset ? 0 : startIndex.value

      const data = await geoserverApi.getWFSFeatures<TProperties>(
        {
          typeName: options.typeName,
          cql_filter: cqlFilter,
          outputFormat: 'application/json',
          version: '2.0.0',
          crs,
          startIndex: offset,
          count: pageSize,
          ...(options.propertyName ? { propertyName: options.propertyName } : {}),
        },
        options.workspace,
      )

      // 过期响应（期间又发起新请求）直接丢弃
      if (gen !== generation) return

      const pageFeatures: WfsFeature<TProperties>[] = (data.features ?? []) as WfsFeature<TProperties>[]
      const matched = Number((data as WfsFeatureCollection<TProperties>).numberMatched ?? (data as WfsFeatureCollection<TProperties>).totalFeatures ?? 0)

      if (isReset) {
        items.value = pageFeatures
      } else {
        items.value = [...items.value, ...pageFeatures]
      }

      totalCount.value = matched
      startIndex.value = offset + pageSize
      hasMore.value = matched > 0 ? startIndex.value < matched : false
    } catch (err) {
      if (gen === generation) error.value = true
      console.warn('[useWfsPagination] fetchPage failed:', err)
    } finally {
      if (gen === generation) loading.value = false
    }
  }

  const loadInitial = (): Promise<void> => fetchPage(true)

  const loadMore = (): Promise<void> => {
    if (!hasMore.value || loading.value) return Promise.resolve()
    return fetchPage(false)
  }

  const resetWithFilter = async (newFilter: string): Promise<void> => {
    cqlFilter = newFilter
    await fetchPage(true)
  }

  onUnmounted(() => {
    generation++
  })

  return {
    items,
    totalCount,
    startIndex,
    hasMore,
    loading,
    error,
    loadInitial,
    loadMore,
    resetWithFilter,
  }
}
