/**
 * 测试 Harness —— 全局 setup。
 *
 * 职责：
 * 1. 统一桩掉浏览器 API 缺失（ResizeObserver / matchMedia / canvas）；
 * 2. 屏蔽测试期间的告警噪音；
 * 3. 提供 GIS 场景常用的固定尺寸视口。
 *
 * 不做：不 mock 业务 store、不 mock 引擎（引擎 mock 由各测试文件按需处理）。
 */
import { afterEach, vi } from 'vitest'
import { config } from '@vue/test-utils'

// Element Plus / 图表类组件依赖 ResizeObserver，jsdom 不提供
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

// 组件常用 media query 判断
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// 固定视口，便于快照与布局类断言稳定
config.global.stubs = {
  transition: false,
  'transition-group': false,
}

afterEach(() => {
  vi.clearAllMocks()
})
