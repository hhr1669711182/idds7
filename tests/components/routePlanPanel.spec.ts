/**
 * 组件测试：routePlanPanel（路径规划面板）
 *
 * 契约四要素（harness 规范）：
 *   Given  Pinia 就绪、routePlanOpen = true、起终点均为空
 *   When   用户切换车型 / 设置端点 / 折叠 / 关闭
 *   Then   store 与面板 DOM 表现符合约定
 *   回归   关联 herness 工作日志 2026-10-13（路径规划面板与检索面板联动）
 *
 * 约束：不连真实网关（amapApi 一律 stub）、不建 OL Map（useCurrentMap 返回空 map，
 * ensureTool 失败即 return，不影响 UI 层断言）。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { amapApi } from '@/apis/amap'

/** 与真实代理同构的 2 方案响应（RoutePlan[] 直传）。 */
const buildPlan = (distance: string, time: string, partDesc: string, coords: number[][]) => ({
  type: 'FeatureCollection',
  totalFeatures: '1',
  totalTime: time,
  totalDistance: distance,
  trafficLights: '3',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::4326' } },
  features: [
    {
      type: 'Feature',
      id: '1',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { distance: '461', partDesc, roadName: '深南大道辅路', tmcs: [] },
    },
  ],
})

vi.mock('@/apis/amap', () => ({
  amapApi: {
    inputTips: vi.fn(async () => ({ tips: [] })),
    driving: vi.fn(async () => ({ route: { paths: [] } })),
    drivingV2: vi.fn(async () => ({ route: { paths: [] } })),
    truckDriving: vi.fn(async () => ({ route: { paths: [] } })),
  },
}))

/** 记录 fit 调用的假地图：SearchResultTool 只依赖 addLayer / getView。 */
const fitCalls: { extent: number[]; options?: unknown }[] = []
const fakeMap = {
  addLayer: () => {},
  removeLayer: () => {},
  getView: () => ({
    fit: (extent: number[], options?: unknown) => {
 fitCalls.push({ extent, options })
    },
  }),
}

vi.mock('@/composables/useCurrentMap', () => ({
  useCurrentMap: () => ({ currentMap: { value: fakeMap } }),
}))

const importComponent = async () => {
  const mod = await import('@/components/map/component/routePlanPanel.vue')
  return mod.default
}

const mountPanel = async (): Promise<VueWrapper> => {
  const component = await importComponent()
  return mount(component)
}

describe('components/map/routePlanPanel 路径规划面板', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('Given 未打开时不渲染任何 DOM（省掉无谓计算）', async () => {
    const { useSearchPanelStore } = await import('@/store/useSearchPanelStore')
    const store = useSearchPanelStore()
    store.routePlanOpen = false

    const wrapper = await mountPanel()

    expect(wrapper.find('.route-plan-panel').exists()).toBe(false)
  })

  it('打开且未折叠：渲染起点 / 终点 / 分析按钮', async () => {
    const { useSearchPanelStore } = await import('@/store/useSearchPanelStore')
    const store = useSearchPanelStore()
    store.routePlanOpen = true

    const wrapper = await mountPanel()
    await nextTick()

    expect(wrapper.find('.route-plan-panel').exists()).toBe(true)
    expect(wrapper.find('.rp-title').text()).toBe('路径规划')
    expect(wrapper.findAll('.rp-label').map((n) => n.text())).toContain('起点')
    expect(wrapper.findAll('.rp-label').map((n) => n.text())).toContain('终点')
    expect(wrapper.find('.rp-analyze-btn').exists()).toBe(true)
  })

  it('起终点未选时分析按钮 disabled 且给出提示文案', async () => {
    const { useSearchPanelStore } = await import('@/store/useSearchPanelStore')
    const store = useSearchPanelStore()
    store.routePlanOpen = true

    const wrapper = await mountPanel()
    await nextTick()

    expect(wrapper.find('.rp-analyze-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.rp-status-text').text()).toBe('请选择起点与终点后点击分析')
  })

  it('起终点都有坐标时分析按钮可点击（回归：坐标丢失导致无法分析）', async () => {
    const { useSearchPanelStore } = await import('@/store/useSearchPanelStore')
    const store = useSearchPanelStore()
    store.routePlanOpen = true
    store.routeForm.start.lngLat = [113.92, 22.53]
    store.routeForm.end.lngLat = [113.94, 22.55]

    const wrapper = await mountPanel()
    await nextTick()

    expect(wrapper.find('.rp-analyze-btn').attributes('disabled')).toBeUndefined()
  })

  it('折叠：标题栏保留，表单收起', async () => {
    const { useSearchPanelStore } = await import('@/store/useSearchPanelStore')
    const store = useSearchPanelStore()
    store.routePlanOpen = true

    const wrapper = await mountPanel()
    await nextTick()
    expect(wrapper.find('.rp-body').exists()).toBe(true)

    await wrapper.find('.rp-fold').trigger('click')
    await nextTick()

    expect(store.routePanelCollapsed).toBe(true)
    expect(wrapper.find('.rp-header').exists()).toBe(true)
    expect(wrapper.find('.rp-body').exists()).toBe(false)
  })

  it('关闭：整体隐藏并清空 open 标记', async () => {
    const { useSearchPanelStore } = await import('@/store/useSearchPanelStore')
    const store = useSearchPanelStore()
    store.routePlanOpen = true

    const wrapper = await mountPanel()
    await nextTick()

    await wrapper.find('.rp-close').trigger('click')
    await nextTick()

    expect(store.routePlanOpen).toBe(false)
    expect(wrapper.find('.route-plan-panel').exists()).toBe(false)
  })

  it('切到货车：渲染载重 / 限高 / 限宽约束（契约）', async () => {
    const { useSearchPanelStore } = await import('@/store/useSearchPanelStore')
    const store = useSearchPanelStore()
    store.routePlanOpen = true
    store.routeForm.vehicle = 'truck'

    const wrapper = await mountPanel()
    await nextTick()

    const labels = wrapper.findAll('.rp-label').map((n) => n.text())
    expect(labels).toContain('载重(t)')
    expect(labels).toContain('限高(m)')
    expect(labels).toContain('限宽(m)')
  })

  it('规划结果：多方案卡片展示方案序号 / 档位 tag / 指标次栏', async () => {
    const { useSearchPanelStore } = await import('@/store/useSearchPanelStore')
    const store = useSearchPanelStore()
    store.routePlanOpen = true
    store.routeForm.start.lngLat = [113.92, 22.53]
    store.routeForm.end.lngLat = [113.94, 22.55]

    vi.mocked(amapApi.driving).mockResolvedValue([
      buildPlan('6350', '1079', '沿深南大道辅路向东行驶461米右转', [
        [113.9547, 22.5431],
        [113.9592, 22.5431],
      ]),
      buildPlan('6154', '999', '沿沙河东路向南行驶456米左转', [
        [113.9592, 22.5431],
        [113.9595, 22.5427],
      ]),
    ] as never)

    const wrapper = await mountPanel()
    await nextTick()

    await wrapper.find('.rp-analyze-btn').trigger('click')
    await nextTick()
    await nextTick()

    // 两套方案卡片
    const cards = wrapper.findAll('.rp-option')
    expect(cards).toHaveLength(2)
    expect(cards[0].find('.rp-option-index').text()).toBe('方案1')
    expect(cards[1].find('.rp-option-index').text()).toBe('方案2')
    // 次栏指标
    expect(cards[0].find('.rp-option-meta').text()).toContain('6.35')
    expect(cards[0].find('.rp-option-meta').text()).toContain('红绿灯3个')
  })

  it('转向指引：点击后定位到该路段（地图 fit 到该路段范围）', async () => {
    const { useSearchPanelStore } = await import('@/store/useSearchPanelStore')
    const store = useSearchPanelStore()
    store.routePlanOpen = true
    store.routeForm.start.lngLat = [113.92, 22.53]
    store.routeForm.end.lngLat = [113.94, 22.55]

    vi.mocked(amapApi.driving).mockResolvedValue([
      buildPlan('6350', '1079', '沿深南大道辅路向东行驶461米右转', [
        [113.9547, 22.5431],
        [113.9592, 22.5431],
      ]),
    ] as never)

    const wrapper = await mountPanel()
    await nextTick()

    await wrapper.find('.rp-analyze-btn').trigger('click')
    await nextTick()
    await nextTick()

    // 展开方案，让指引可见
    await wrapper.find('.rp-option-fold').trigger('click')
    await nextTick()

    const steps = wrapper.findAll('.rp-step')
    expect(steps).toHaveLength(1)

    fitCalls.length = 0
    await steps[0].trigger('click')
    await nextTick()

    // 触发了地图 fit，且范围是该路段的首尾点
    expect(fitCalls.length).toBeGreaterThan(0)
    const extent = fitCalls[fitCalls.length - 1].extent
    expect(extent).toHaveLength(4)
    // 该行进入高亮态
    expect(wrapper.find('.rp-step').classes()).toContain('active')
  })
})
