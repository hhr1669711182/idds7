// playwright.config.ts —— E2E（独立 runner，不参与 dev / vitest 流程）
//
// 设计约束：
// 1. 完全独立命令 `pnpm e2e`，不进 pnpm dev / postinstall，对开发性能零影响；
// 2. testDir 指向 tests/e2e，产物统一落在 tests/__artifacts__/e2e；
// 3. webServer 复用 dev server（本地 reuseExistingServer 直接复用已开的 8888）；
// 4. 只放「冒烟级」用例（页面能起、路由能进、关键 DOM 存在），
//    深度业务断言交给 vitest 组件测试，避免 E2E 跑得慢又脆。
import { defineConfig, devices } from '@playwright/test'

const PORT = 8888
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/__artifacts__/e2e/results',
  // CI 上禁止重试掩盖不稳定用例；本地允许 1 次重试
  retries: process.env.CI ? 0 : 1,
  // 单 worker 串行：项目地图初始化吃内存，并行会抢 GPU / 端口
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'tests/__artifacts__/e2e/report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 本机可能没预装 Playwright 自带 chromium（当前要求 1248，构建包 150MB+）。
        // 默认复用系统已安装的 Chrome，省掉一次大下载；
        // CI 或需要自带浏览器时设 PW_USE_SYSTEM_CHROME=0 即可回落到自带版本。
        channel: process.env.PW_USE_SYSTEM_CHROME === '0' ? undefined : 'chrome',
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})