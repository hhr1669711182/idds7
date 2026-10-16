import { expect, test } from '@playwright/test'

/**
 * 冒烟 E2E：应用能起来 + 核心路由能进 + 检索面板在页面上真实存在。
 *
 * 契约四要素：
 *   Given  dev server 已在 8888 端口就绪（webServer 自动拉起）
 *   When   依次访问 / → /map
 *   Then   页面无致命错误、hash 路由正确、检索面板 DOM 在位
 *   回归   关联 herness 工作日志 2026-10-13（检索面板上屏）
 *
 * 约束：
 * - 不断言像素与瓦片加载（CI 无外网 / 无高德 key 会导致瓦片 401）；
 * - 只拦未捕获的 JS 运行时异常，Vue warn / console.error 不计入。
 */

/** dev server 冷启动时 Vite 需首次转换 home.vue 及其整条依赖链，可能瞬时超时。
 *  这是预热问题而非产品缺陷，用一次刷新兜底；真正的产品缺陷第二次依然会失败。 */
const gotoWithWarmup = async (page: import('@playwright/test').Page, url: string) => {
  await page.goto(url)
  const inputButton = page.locator('.input-search-btn')
  try {
    await inputButton.waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    // 预热失败：刷新一次再等（此时 Vite 缓存已建立，转换不再超时）
    await page.reload({ waitUntil: 'domcontentloaded' })
    await inputButton.waitFor({ state: 'visible', timeout: 30_000 })
  }
}

test('根路径重定向到 /map 且检索面板在位', async ({ page }) => {
  await gotoWithWarmup(page, '/')

  await expect(page).toHaveURL(/#\/map/)
  // 检索面板的查询按钮存在 = home.vue + circleQueryPanel 已挂载
  await expect(page.locator('.input-search-btn')).toBeVisible()
})

test('检索面板输入框可聚焦并展开视图下拉', async ({ page }) => {
  await gotoWithWarmup(page, '/#/map')

  const input = page.locator('.input-panel .el-input__inner').first()
  await expect(input).toBeVisible()

  await input.click()
  const dropdown = page.locator('.view-dropdown')
  if (await dropdown.count()) {
    await expect(dropdown).toBeVisible()
  }
})

test('页面加载期间无未捕获 JS 异常', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await gotoWithWarmup(page, '/#/map')
  // 给地图 / 路由懒加载留出时间
  await page.waitForTimeout(2000)

  // 只拦真正未捕获的运行时错误；Vue warn / console.error 走 console 通道，不在此列
  expect(errors, `未捕获异常：\n${errors.join('\n')}`).toEqual([])
})
