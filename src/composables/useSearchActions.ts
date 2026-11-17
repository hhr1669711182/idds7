// 用途：检索面板的 API 调用编排（从 useSearchPanelStore 拆出，消除 store → apis 越层）
import { computed } from 'vue'
import {
  SEARCH_MAX_FEATURES,
  type SearchQueryParams,
  type SearchResultBucket,
  type SearchViewOption,
} from '@/types/search'
import { getSearchViewOptions, getLayerNameMap, runSearch, searchGisResources, searchAmapAddress } from '@/apis/searchQuery'
import { useSearchPanelStore } from '@/store/useSearchPanelStore'

/** 资源检索分页每页大小（WFS 2.0.0 count 参数） */
const RESOURCE_PAGE_SIZE = 100

const emptyBucket = (): SearchResultBucket => ({ items: [], truncated: false, failedLayers: 0 })

export function useSearchActions() {
  const store = useSearchPanelStore()

  /** 视图下拉可选项：name 仅展示，id 为唯一数据依据 */
  const viewOptions = computed<SearchViewOption[]>(() => getSearchViewOptions())

  /** 纯文本检索：两源并行，默认落在地址信息 tab */
  const runKeywordSearch = async (keyword: string, viewport?: [number, number, number, number]) => {
    const text = keyword.trim()
    if (!text) {
      store.clearResults()
      return
    }
    store.queryText = text
    store.selectedView = null
    store.loading = true
    store.searchError = null
    try {
      const params: SearchQueryParams = {
        keyword: text,
        viewport,
        maxFeatures: SEARCH_MAX_FEATURES,
      }
      const { address, resource, filter } = await runSearch(params)
      store.addressResults = address
      store.resourceResults = resource
      store.activeFilter = filter
      // 资源检索分页游标：首屏由 runSearch 拉第 1 页（startIndex=0），记录参数与剩余可加载态供 loadMore 翻页
      store.resourceSearchParams = params
      store.resourceStartIndex = 0
      store.resourceHasMore = resource.truncated
      // 默认落在地址信息 tab；地址无结果时自动回落到资源 tab
      store.activeTab = address.items.length ? 'address' : 'resource'
    } catch (error) {
      console.warn('[useSearchActions] runKeywordSearch failed:', error)
      store.searchError = '查询失败，请稍后重试'
    } finally {
      store.loading = false
    }
  }

  /**
   * 选中视图 id：资源按图层 id 精确查询，同时用视图中文名做一次文本模糊，
   * 保证输入框有文本回显、地址 tab 也有数据可切换。
   */
  const runViewSearch = async (typeName: string, keyword?: string) => {
    store.selectedView = typeName
    store.queryText = keyword ?? ''
    store.loading = true
    store.searchError = null
    store.searchPanelCollapsed = false
    try {
      // 资源源：按视图 id 精确查询该图层全部资源
      const resourceParams: SearchQueryParams = {
        keyword: '',
        typeName,
        maxFeatures: SEARCH_MAX_FEATURES,
      }
      const { resource, filter } = await runSearch(resourceParams)
      // 资源检索分页游标：首屏拉第 1 页，记录参数与剩余可加载态
      store.resourceSearchParams = resourceParams
      store.resourceStartIndex = 0
      store.resourceHasMore = resource.truncated

      // 地址源：直接用高德模糊检索，不走 runSearch（runSearch 会触发全量图层 WFS 请求）
      const text = (keyword ?? '').trim()
      let address: SearchResultBucket = emptyBucket()
      if (text) {
        try {
          address = await searchAmapAddress(text, SEARCH_MAX_FEATURES)
        } catch {
          address = emptyBucket()
        }
      }

      store.resourceResults = resource
      store.addressResults = address
      store.activeFilter = filter
      // 需求：选中视图选项后默认展示消防资源 tab，地址 tab 也保留数据可切换
      store.activeTab = 'resource'
    } catch (error) {
      console.warn('[useSearchActions] runViewSearch failed:', error)
      store.searchError = '视图检索失败，请稍后重试'
    } finally {
      store.loading = false
    }
  }

  /** 圈选检索：按圈选中心与半径查询资源列表，并把 WMS 条件交给调用方上图 */
  const runCircleSearch = async (center: [number, number], radiusMeters: number, typeNames: string[]) => {
    store.loading = true
    store.searchError = null
    try {
      const params: SearchQueryParams = {
        keyword: '',
        typeNames,
        circle: { center, radiusMeters },
        maxFeatures: SEARCH_MAX_FEATURES,
      }
      const { resource, filter } = await runSearch(params)
      store.resourceResults = resource
      store.activeFilter = filter
      // 资源检索分页游标：首屏拉第 1 页，记录参数与剩余可加载态
      store.resourceSearchParams = params
      store.resourceStartIndex = 0
      store.resourceHasMore = resource.truncated
      store.activeTab = 'resource'
      store.selectedItem = null
      return filter
    } catch (error) {
      console.warn('[useSearchActions] runCircleSearch failed:', error)
      store.searchError = '圈选查询失败，请稍后重试'
      return null
    } finally {
      store.loading = false
    }
  }

  /**
   * 资源检索翻页加载：按当前 resourceStartIndex 拉下一页（WFS 2.0.0 startIndex + count），
   * 返回的 items 追加到 resourceResults.items（跨面板共享，不失步），并推进游标。
   * 首屏已由 runSearch 拉第 1 页；本方法只在 hasMore 且未加载中时生效。
   */
  const loadMoreResource = async (): Promise<void> => {
    const params = store.resourceSearchParams
    if (!params) return
    if (!store.resourceHasMore || store.resourceLoadingMore || store.loading) return

    store.resourceLoadingMore = true
    store.searchError = null
    const startIndex = store.resourceStartIndex
    try {
      const pageBucket = await searchGisResources(params, getLayerNameMap(), RESOURCE_PAGE_SIZE, startIndex)
      // 去重追加：本页 items 与已有 items 按 key 去重，避免边界重复
      const current = store.resourceResults
      const seen = new Set(current.items.map((item) => item.key))
      const appended = pageBucket.items.filter((item) => !seen.has(item.key))
      store.resourceResults = {
        ...current,
        items: [...current.items, ...appended],
        truncated: pageBucket.truncated,
        totalCount: pageBucket.totalCount ?? current.totalCount,
      }
      store.resourceStartIndex = startIndex + RESOURCE_PAGE_SIZE
      store.resourceHasMore = pageBucket.truncated
    } catch (error) {
      console.warn('[useSearchActions] loadMoreResource failed:', error)
      store.searchError = '加载更多失败，请稍后重试'
    } finally {
      store.resourceLoadingMore = false
    }
  }

  return { viewOptions, runKeywordSearch, runViewSearch, runCircleSearch, loadMoreResource }
}
