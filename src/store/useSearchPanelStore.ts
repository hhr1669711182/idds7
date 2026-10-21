/**
 * 检索面板 + 路径规划面板的状态中枢。
 * 检索状态跨「circleQueryPanel」「routePlanPanel」「SearchResultTool」三处共享，
 * 必须脱离组件生命周期，故收敛到 store。
 */
import { defineStore } from 'pinia'
import { piniaSession } from './piniaPersist'
import {
  SEARCH_MAX_FEATURES,
  type ResourceFilterSet,
  type RoutePlanForm,
  type RouteVehicleType,
  type SearchQueryParams,
  type SearchResultBucket,
  type SearchResultItem,
  type SearchSourceTab,
  type SearchViewOption,
} from '@/types/search'
import { getSearchViewOptions, runSearch } from '@/apis/searchQuery'

const emptyBucket = (): SearchResultBucket => ({ items: [], truncated: false, failedLayers: 0 })

const emptyRouteForm = (): RoutePlanForm => ({
  vehicle: 'car',
  start: { text: '', lngLat: null },
  end: { text: '', lngLat: null },
  truck: {},
  manualTrigger: false,
})

/** 持久化载荷：只存需要跨会话记忆的字段（含端点坐标，避免面板切换后点位丢失） */
type RouteHistory = {
  vehicle: RouteVehicleType
  startText: string
  endText: string
  startLngLat: [number, number] | null
  endLngLat: [number, number] | null
  truck: RoutePlanForm['truck']
}

export const useSearchPanelStore = defineStore(
  'searchPanelStore',
  () => {
    // ===== 检索面板状态 =====
    const queryText = ref('')
    /** 选中的视图 id（GeoServer typeName），null 表示纯文本检索 */
    const selectedView = ref<string | null>(null)
    const activeTab = ref<SearchSourceTab>('address')
    const addressResults = ref<SearchResultBucket>(emptyBucket())
    const resourceResults = ref<SearchResultBucket>(emptyBucket())
    /** 最近一次检索的 CQL 条件，交给 SearchResultTool 走 WMS 上图 */
    const activeFilter = ref<ResourceFilterSet>({ typeNames: [], filters: [] })
    const selectedItem = ref<SearchResultItem | null>(null)
    const loading = ref(false)
    const searchError = ref<string | null>(null)
    // ===== 面板显隐与折叠 =====
    /**
     * 面板互不排斥：cq-panel 与 route-plan-panel 可以同时打开，各自独立折叠。
     * input-panel 是常驻独立面板，不参与这里的显隐控制。
     */
    // cq-panel 初始折叠：input-panel 常驻，检索结果面板由用户点输入框展开
    const searchPanelCollapsed = ref(true)
    // cq-panel 是否被关闭（区别于折叠：关闭后整体隐藏，折叠只保留标题栏）
    // 初始为 true：未发起输入框检索 / 圈选检索前，cq-panel 默认隐藏
    const searchPanelClosed = ref(true)

    const routePlanOpen = ref(false)
    const routePanelCollapsed = ref(false)

    // ===== 路径规划 =====
    const routeForm = ref<RoutePlanForm>(emptyRouteForm())
    const routePlanning = ref(false)
    const routeHistory = ref<RouteHistory>({
      vehicle: 'car',
      startText: '',
      endText: '',
      startLngLat: null,
      endLngLat: null,
      truck: {},
    })

    /** 视图下拉可选项：name 仅展示，id 为唯一数据依据 */
    const viewOptions = computed<SearchViewOption[]>(() => getSearchViewOptions())

    /** 当前 tab 对应的结果桶 */
    const activeBucket = computed<SearchResultBucket>(() =>
      activeTab.value === 'address' ? addressResults.value : resourceResults.value,
    )

    const hasResults = computed(() => addressResults.value.items.length > 0 || resourceResults.value.items.length > 0)

    const canPlan = computed(() => !!routeForm.value.start.lngLat && !!routeForm.value.end.lngLat)

    const switchTab = (tab: SearchSourceTab) => {
      activeTab.value = tab
    }

    const clearResults = () => {
      queryText.value = ''
      selectedView.value = null
      selectedItem.value = null
      activeTab.value = 'address'
      addressResults.value = emptyBucket()
      resourceResults.value = emptyBucket()
      activeFilter.value = { typeNames: [], filters: [] }
      searchError.value = null
      loading.value = false
    }

    /** 纯文本检索：两源并行，默认落在地址信息 tab */
    const runKeywordSearch = async (keyword: string, viewport?: [number, number, number, number]) => {
      const text = keyword.trim()
      if (!text) {
        clearResults()
        return
      }
      queryText.value = text
      selectedView.value = null
      loading.value = true
      searchError.value = null
      try {
        const params: SearchQueryParams = {
          keyword: text,
          viewport,
          maxFeatures: SEARCH_MAX_FEATURES,
        }
        const { address, resource, filter } = await runSearch(params)
        addressResults.value = address
        resourceResults.value = resource
        activeFilter.value = filter
        // 默认落在地址信息 tab；地址无结果时自动回落到资源 tab
        activeTab.value = address.items.length ? 'address' : 'resource'
      } catch (error) {
        console.warn('[useSearchPanelStore] runKeywordSearch failed:', error)
        searchError.value = '查询失败，请稍后重试'
      } finally {
        loading.value = false
      }
    }

    /**
     * 选中视图 id：资源按图层 id 精确查询，同时用视图中文名做一次文本模糊，
     * 保证输入框有文本回显、地址 tab 也有数据可切换。
     */
    const runViewSearch = async (typeName: string, keyword?: string) => {
      selectedView.value = typeName
      queryText.value = keyword ?? ''
      loading.value = true
      searchError.value = null
      searchPanelCollapsed.value = false
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

        resourceResults.value = resource
        addressResults.value = address
        activeFilter.value = filter
        // 有地址结果落地址 tab，否则落资源 tab（需求：默认展示消防资源）
        // 需求：选中视图选项后默认展示消防资源 tab，地址 tab 也保留数据可切换
        activeTab.value = 'resource'
      } catch (error) {
        console.warn('[useSearchPanelStore] runViewSearch failed:', error)
        searchError.value = '视图检索失败，请稍后重试'
      } finally {
        loading.value = false
      }
    }

    /** 圈选检索：按圈选中心与半径查询资源列表，并把 WMS 条件交给调用方上图 */
    const runCircleSearch = async (center: [number, number], radiusMeters: number, typeNames: string[]) => {
      loading.value = true
      searchError.value = null
      try {
        const params: SearchQueryParams = {
          keyword: '',
          typeNames,
          circle: { center, radiusMeters },
          maxFeatures: SEARCH_MAX_FEATURES,
        }
        const { resource, filter } = await runSearch(params)
        resourceResults.value = resource
        activeFilter.value = filter
        activeTab.value = 'resource'
        selectedItem.value = null
        return filter
      } catch (error) {
        console.warn('[useSearchPanelStore] runCircleSearch failed:', error)
        searchError.value = '圈选查询失败，请稍后重试'
        return null
      } finally {
        loading.value = false
      }
    }

    const selectItem = (item: SearchResultItem | null) => {
      selectedItem.value = item
    }

    // ===== Panel linkage (requires 1 / 7) =====
    // cq-panel and route-plan-panel are mutually independent: each can be opened and folded separately.
    // The input-panel is always present, with no show / hide logic attached.

    /** Expand the retrieval results panel */
    const expandSearchPanel = () => {
      searchPanelClosed.value = false
      searchPanelCollapsed.value = false
    }

    /** Close the resource fuzzy-search panel entirely; it differs from folding, which keeps only the header visible */
    const closeSearchPanel = () => {
      searchPanelClosed.value = true
      searchPanelCollapsed.value = true
    }

    const reopenSearchPanel = () => {
      searchPanelClosed.value = false
      searchPanelCollapsed.value = false
    }

    const toggleSearchPanel = () => {
      searchPanelCollapsed.value = !searchPanelCollapsed.value
    }

    /** Open / close the route planning panel; both can coexist */
    const toggleRoutePanel = () => {
      routePlanOpen.value = !routePlanOpen.value
      if (routePlanOpen.value) routePanelCollapsed.value = false
    }

    const openRoutePanel = () => {
      routePlanOpen.value = true
      routePanelCollapsed.value = false
    }

    const closeRoutePanel = () => {
      routePlanOpen.value = false
    }

    const toggleRoutePanelCollapse = () => {
      routePanelCollapsed.value = !routePanelCollapsed.value
    }

    // ===== Route planning form =====
    const setRouteVehicle = (vehicle: RouteVehicleType) => {
      routeForm.value.vehicle = vehicle
      // 小汽车 / 货车统一由「分析」按钮手动触发，选点不再自动查询
      routeForm.value.manualTrigger = true
      syncRouteHistory()
    }

    const setRouteEndpoint = (which: 'start' | 'end', text: string, lngLat: [number, number] | null) => {
      routeForm.value[which] = { text, lngLat }
      syncRouteHistory()
    }

    const clearRouteEndpoint = (which: 'start' | 'end') => {
      routeForm.value[which] = { text: '', lngLat: null }
      syncRouteHistory()
    }

    const setTruckConstraint = (key: keyof RoutePlanForm['truck'], value: string) => {
      routeForm.value.truck[key] = value.trim() || undefined
      syncRouteHistory()
    }

    const setRoutePlanning = (value: boolean) => {
      routePlanning.value = value
    }

    const resetRoute = () => {
      routeForm.value = emptyRouteForm()
      routePlanning.value = false
      syncRouteHistory()
    }

    // ===== Historical memory (goes through the piniaPersist unified wrapper; localStorage is not written inline) =====
    const syncRouteHistory = () => {
      routeHistory.value = {
        vehicle: routeForm.value.vehicle,
        startText: routeForm.value.start.text,
        endText: routeForm.value.end.text,
        startLngLat: routeForm.value.start.lngLat ? [...routeForm.value.start.lngLat] : null,
        endLngLat: routeForm.value.end.lngLat ? [...routeForm.value.end.lngLat] : null,
        truck: { ...routeForm.value.truck },
      }
    }

    /** 面板打开时回填历史记忆：文本、端点坐标、车型与货车条件一并恢复，切换面板不再丢点位 */
    const hydrateRouteHistory = () => {
      const saved = routeHistory.value
      routeForm.value.vehicle = saved.vehicle ?? 'car'
      routeForm.value.manualTrigger = true
      routeForm.value.start = {
        text: saved.startText ?? '',
        lngLat: saved.startLngLat ? ([...saved.startLngLat] as [number, number]) : null,
      }
      routeForm.value.end = {
        text: saved.endText ?? '',
        lngLat: saved.endLngLat ? ([...saved.endLngLat] as [number, number]) : null,
      }
      routeForm.value.truck = { ...(saved.truck ?? {}) }
    }

    return {
      // Retrieval
      queryText,
      selectedView,
      activeTab,
      addressResults,
      resourceResults,
      activeFilter,
      selectedItem,
      loading,
      searchError,
      hasResults,
      activeBucket,
      viewOptions,
      switchTab,
      clearResults,
      runKeywordSearch,
      runViewSearch,
      runCircleSearch,
      selectItem,
      // Panels
      searchPanelCollapsed,
      searchPanelClosed,
      routePlanOpen,
      routePanelCollapsed,
      expandSearchPanel,
      toggleSearchPanel,
      closeSearchPanel,
      reopenSearchPanel,
      toggleRoutePanel,
      openRoutePanel,
      closeRoutePanel,
      toggleRoutePanelCollapse,
      // Route planning
      routeForm,
      routePlanning,
      canPlan,
      setRouteVehicle,
      setRouteEndpoint,
      clearRouteEndpoint,
      setTruckConstraint,
      setRoutePlanning,
      resetRoute,
      routeHistory,
      syncRouteHistory,
      hydrateRouteHistory,
    }
  },
  {
    persist: {
      storage: piniaSession,
      pick: ['routeHistory'],
    },
  },
)
