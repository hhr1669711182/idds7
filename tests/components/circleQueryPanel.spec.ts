/**
 * 组件测试：circleQueryPanel（检索 + 圈选面板）
 *
 * 契约四要素（harness 规范）：
 *   Given  Pinia 就绪、检索面板初始为「关闭 + 折叠」
 *   When   用户聚焦输入框 / 切换折叠 / 输入关键词
 *   Then   store 状态与面板 DOM 表现符合约定
 *   回归   关联 herness 工作日志 2026-10-13（检索面板与圈选联动）
 *
 * 约束：不连真实网关（amapApi / runSearch 一律被 stub）、不建 OL Map、不断言像素。
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

// ── 模块级 stub：必须在 import 组件前生效 ────────────────────────────────
const amapApiStub = {
  searchPoi: vi.fn(async () => ({ pois: [] })),
  regeo: vi.fn(async () => ({ regeocode: { pois: [] } })),
  ipLocation: vi.fn(async () => ({ lng: 113.93, lat: 22.53 })),
  driving: vi.fn(async () => ({ route: { paths: [] } })),
}

vi.mock('@/apis/amap', () => ({ amapApi: amapApiStub }))
vi.mock('@/apis/searchQuery', () => ({
  getSearchViewOptions: () => [{ id: 'gis:v_srvc_water_hydrant', name: '消火栓' }],
  runSearch: vi.fn(async () => ({ addressItems: [], resourceItems: [], truncated: false, failedLayers: 0 })),
}))

const importComponent = async () => {
  const mod = await import('@/components/map/component/circleQueryPanel.vue')
  return mod.default
}

const mountPanel = async (): Promise<VueWrapper> => {
  const component = await importComponent()
  return mount(component, {
    global: {
      stubs: {
        RoutePlanPanel: { template: '<div class="route-plan-panel-stub" />' },
      },
    },
  })
}

describe('components/map/circleQueryPanel 检索面板', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('Given 初始状态：输入框常驻，检索结果面板隐藏', async () => {
    const wrapper = await mountPanel()

    // input-panel 常驻可见
    expect(wrapper.find('.input-panel').exists()).toBe(true)
    expect(wrapper.find('.input-search-btn').exists()).toBe(true)
    // cq-panel 初始 closed
    expect(wrapper.find('.cq-panel').exists()).toBe(false)
  })

  it('查询按钮在无关键词时 disabled，有关键词时恢复（回归：空查询误发请求）', async () => {
    const wrapper = await mountPanel()
    const button = wrapper.find('.input-search-btn')

    expect(button.attributes('disabled')).toBeDefined()

    // 直接改 store（等价于用户输入）
    const { useSearchPanelStore } = await import('@/store')
    const store = useSearchPanelStore()
    store.queryText = '消防站'
    await nextTick()

    expect(wrapper.find('.input-search-btn').attributes('disabled')).toBeUndefined()
  })

  it('聚焦输入框只展开视图下拉，不擅自打开结果面板（契约）', async () => {
    const wrapper = await mountPanel()
    const { useSearchPanelStore } = await import('@/store')
    const store = useSearchPanelStore()

    expect(store.searchPanelClosed).toBe(true)
    expect(store.viewOptions.length).toBeGreaterThan(0)

    await wrapper.find('.input-panel-inner').trigger('click')
    await nextTick()

    // 结果面板仍未打开（打开由查询触发，非聚焦触发）
    expect(store.searchPanelClosed).toBe(true)
    expect(wrapper.find('.cq-panel').exists()).toBe(false)
    // 但视图下拉已展开，选项数与 store 一致
    expect(wrapper.find('.view-dropdown').exists()).toBe(true)
    expect(wrapper.findAll('.view-option').length).toBe(store.viewOptions.length)
  })
  it('无结果时显示「未找到匹配结果」空态（回归：空列表白屏）', async () => {
    const wrapper = await mountPanel()
    const { useSearchPanelStore } = await import('@/store')
    const store = useSearchPanelStore()
    store.searchPanelClosed = false
    store.searchPanelCollapsed = false
    await nextTick()

    expect(wrapper.find('.cq-empty').exists()).toBe(true)
    expect(wrapper.text()).toContain('未找到匹配结果')
  })

  it('折叠 / 关闭按钮分别切换对应 store 状态', async () => {
    const wrapper = await mountPanel()
    const { useSearchPanelStore } = await import('@/store')
    const store = useSearchPanelStore()
    store.searchPanelClosed = false
    store.searchPanelCollapsed = false
    await nextTick()

    // 折叠
    await wrapper.find('.cq-fold').trigger('click')
    expect(store.searchPanelCollapsed).toBe(true)
    // 标题栏仍在，内容区被收起
    expect(wrapper.find('.cq-panel').exists()).toBe(true)
    expect(wrapper.find('.cq-list').exists()).toBe(false)

    // 关闭
    await wrapper.find('.cq-close').trigger('click')
    expect(store.searchPanelClosed).toBe(true)
    expect(wrapper.find('.cq-panel').exists()).toBe(false)
  })

  it('结果条目点击后标记 active（回归：选中态丢失）', async () => {
    const wrapper = await mountPanel()
    const { useSearchPanelStore } = await import('@/store')
    const store = useSearchPanelStore()
    store.searchPanelClosed = false
    store.searchPanelCollapsed = false
    store.addressResults = {
      items: [
        {
          key: 'a1',
          title: '南头消防救援站',
          subtitle: '广东省深圳市南山区',
          lngLat: [113.92, 22.53],
          locatable: true,
        },
      ],
      truncated: false,
      failedLayers: 0,
    }
    await nextTick()

    const item = wrapper.find('.cq-list-item')
    expect(item.exists()).toBe(true)
    expect(item.classes()).not.toContain('active')

    await item.trigger('click')
    await nextTick()

    expect(wrapper.find('.cq-list-item').classes()).toContain('active')
  })
})
