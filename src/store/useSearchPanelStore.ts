/**
 * 检索面板 + 路径规划面板的状态中枢。
 * 检索状态跨「circleQueryPanel」「routePlanPanel」「SearchResultTool」三处共享，
 * 必须脱离组件生命周期，故收敛到 store。
 * API 调用编排在 composables/useSearchActions.ts，本 store 只存状态。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { piniaSession } from './piniaPersist'
import {
  type ResourceFilterSet,
  type RoutePlanForm,
  type RouteVehicleType,
  type SearchResultBucket,
  type SearchResultItem,
  type SearchSourceTab,
} from '@/types/search'

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
    const searchPanelCollapsed = ref(true)
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

    const selectItem = (item: SearchResultItem | null) => {
      selectedItem.value = item
    }

    // ===== Panel linkage =====
    const expandSearchPanel = () => {
      searchPanelClosed.value = false
      searchPanelCollapsed.value = false
    }

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

    /** 面板打开时回填历史记忆 */
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
      // Retrieval state
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
      switchTab,
      clearResults,
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
