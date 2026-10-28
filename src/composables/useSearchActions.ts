// 用途：检索面板的 API 调用编排（从 useSearchPanelStore 拆出，消除 store → apis 越层）
import { computed } from 'vue'
import {
  SEARCH_MAX_FEATURES,
  type SearchQueryParams,
  type SearchResultBucket,
  type SearchViewOption,
} from '@/types/search'
import { getSearchViewOptions, runSearch } from '@/apis/searchQuery'
import { useSearchPanelStore } from '@/store/useSearchPanelStore'

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

      // 地址源：用视图中文名做模糊检索，让两个 tab 都有数据可切换
      const text = (keyword ?? '').trim()
      let address: SearchResultBucket = emptyBucket()
      if (text) {
        try {
          const addressParams: SearchQueryParams = {
            keyword: text,
            maxFeatures: SEARCH_MAX_FEATURES,
          }
          address = (await runSearch(addressParams)).address
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

  return { viewOptions, runKeywordSearch, runViewSearch, runCircleSearch }
}
