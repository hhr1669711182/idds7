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
import { getSearchViewOptions, runSearch } from '@/service/searchQuery'

const emptyBucket = (): SearchResultBucket => ({ items: [], truncated: false, failedLayers: 0 })

const emptyRouteForm = (): RoutePlanForm => ({
  vehicle: 'car',
  start: { text: '', lngLat: null },
  end: { text: '', lngLat: null },
  truck: {},
  manualTrigger: false,
})

/** 持久化载荷：只存需要跨会话记忆的字段 */
type RouteHistory = {
  vehicle: RouteVehicleType
  startText: string
  endText: string
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

    // ===== 面板显隐与折叠（两面板互斥） =====
    const searchPanelCollapsed = ref(false)
    const routePlanOpen = ref(false)

    // ===== 路径规划 =====
    const routeForm = ref<RoutePlanForm>(emptyRouteForm())
    const routePlanning = ref(false)
    const routeHistory = ref<RouteHistory>({
      vehicle: 'car',
      startText: '',
      endText: '',
      truck: {},
    })

    /** 视图下拉可选项：name 仅展示，id 为唯一数据依据 */
    const viewOptions = computed<SearchViewOption[]>(() => getSearchViewOptions())

    /** 当前 tab 对应的结果桶 */
    const activeBucket = computed<SearchResultBucket>(() =>
      activeTab.value === 'address' ? addressResults.value : resourceResults.value,
    )

    const hasResults = computed(
      () => addressResults.value.items.length > 0 || resourceResults.value.items.length > 0,
    )

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
    const runKeywordSearch = async (
      keyword: string,
      viewport?: [number, number, number, number],
    ) => {
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

    /** 选中视图 id：只查该图层资源，自动切资源 tab 并展开面板（D6） */
    const runViewSearch = async (typeName: string, keyword?: string) => {
      selectedView.value = typeName
      queryText.value = keyword ?? ''
      loading.value = true
      searchError.value = null
      searchPanelCollapsed.value = false
      try {
        const params: SearchQueryParams = {
          keyword: keyword ?? '',
          typeName,
          maxFeatures: SEARCH_MAX_FEATURES,
        }
        const { resource, filter } = await runSearch(params)
        resourceResults.value = resource
        addressResults.value = emptyBucket()
        activeFilter.value = filter
        activeTab.value = 'resource'
      } catch (error) {
        console.warn('[useSearchPanelStore] runViewSearch failed:', error)
        searchError.value = '视图检索失败，请稍后重试'
      } finally {
        loading.value = false
      }
    }

    /** 圈选检索：按圈选中心与半径查询资源列表，并把 WMS 条件交给调用方上图 */
    const runCircleSearch = async (
      center: [number, number],
      radiusMeters: number,
      typeNames: string[],
    ) => {
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

    // ===== 面板互斥联动（Q5） =====
    /** 展开检索面板 → 收起路径规划面板 */
    const expandSearchPanel = () => {
      searchPanelCollapsed.value = false
      routePlanOpen.value = false
    }

    const toggleSearchPanel = () => {
      searchPanelCollapsed.value = !searchPanelCollapsed.value
      if (!searchPanelCollapsed.value) routePlanOpen.value = false
    }

    /** 展开路径规划面板 → 折叠检索资源面板 */
    const toggleRoutePanel = () => {
      routePlanOpen.value = !routePlanOpen.value
      if (routePlanOpen.value) searchPanelCollapsed.value = true
    }

    const closeRoutePanel = () => {
      routePlanOpen.value = false
    }

    // ===== 路径规划表单 =====
    const setRouteVehicle = (vehicle: RouteVehicleType) => {
      routeForm.value.vehicle = vehicle
      // 小汽车实时触发，货车手动触发（点分析按钮）
      routeForm.value.manualTrigger = vehicle === 'truck'
      syncRouteHistory()
    }

    const setRouteEndpoint = (
      which: 'start' | 'end',
      text: string,
      lngLat: [number, number] | null,
    ) => {
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

    // ===== 历史记忆（走 piniaPersist 统一封装，不散写 localStorage） =====
    const syncRouteHistory = () => {
      routeHistory.value = {
        vehicle: routeForm.value.vehicle,
        startText: routeForm.value.start.text,
        endText: routeForm.value.end.text,
        truck: { ...routeForm.value.truck },
      }
    }

    /** 面板打开时回填历史；坐标需重新选点，故只回填文本与车型条件 */
    const hydrateRouteHistory = () => {
      const saved = routeHistory.value
      routeForm.value.vehicle = saved.vehicle ?? 'car'
      routeForm.value.manualTrigger = routeForm.value.vehicle === 'truck'
      routeForm.value.start = { text: saved.startText ?? '', lngLat: null }
      routeForm.value.end = { text: saved.endText ?? '', lngLat: null }
      routeForm.value.truck = { ...(saved.truck ?? {}) }
    }

    return {
      // 检索
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
      // 面板
      searchPanelCollapsed,
      routePlanOpen,
      expandSearchPanel,
      toggleSearchPanel,
      toggleRoutePanel,
      closeRoutePanel,
      // 路径规划
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