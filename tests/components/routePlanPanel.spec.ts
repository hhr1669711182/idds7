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

vi.mock('@/apis/amap', () => ({
  amapApi: {
    inputTips: vi.fn(async () => ({ tips: [] })),
    driving: vi.fn(async () => ({ route: { paths: [] } })),
    truckDriving: vi.fn(async () => ({ route: { paths: [] } })),
  },
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
    const { useSearchPanelStore } = await import('@/store')
    const store = useSearchPanelStore()
    store.routePlanOpen = false

    const wrapper = await mountPanel()

    expect(wrapper.find('.route-plan-panel').exists()).toBe(false)
  })

  it('打开且未折叠：渲染起点 / 终点 / 分析按钮', async () => {
    const { useSearchPanelStore } = await import('@/store')
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
    const { useSearchPanelStore } = await import('@/store')
    const store = useSearchPanelStore()
    store.routePlanOpen = true

    const wrapper = await mountPanel()
    await nextTick()

    expect(wrapper.find('.rp-analyze-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.rp-status-text').text()).toBe('请选择起点与终点后点击分析')
  })

  it('起终点都有坐标时分析按钮可点击（回归：坐标丢失导致无法分析）', async () => {
    const { useSearchPanelStore } = await import('@/store')
    const store = useSearchPanelStore()
    store.routePlanOpen = true
    store.routeForm.start.lngLat = [113.92, 22.53]
    store.routeForm.end.lngLat = [113.94, 22.55]

    const wrapper = await mountPanel()
    await nextTick()

    expect(wrapper.find('.rp-analyze-btn').attributes('disabled')).toBeUndefined()
  })

  it('折叠：标题栏保留，表单收起', async () => {
    const { useSearchPanelStore } = await import('@/store')
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
    const { useSearchPanelStore } = await import('@/store')
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
    const { useSearchPanelStore } = await import('@/store')
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
})
