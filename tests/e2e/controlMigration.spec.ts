import { expect, test } from '@playwright/test'

test('Given 已挂载地图 When 另一标签更新共享阶段和F10模式 Then 导航到特灾并可返回值守；回归 Control M7', async ({
  page,
  context,
}) => {
  await page.goto('/#/map')
  await expect(page.locator('.input-search-btn')).toBeVisible({ timeout: 60_000 })
  const writer = await context.newPage()
  await writer.route('**/__storage-writer', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' }),
  )
  await writer.goto('/__storage-writer')
  const shared = {
    v: 1,
    updatedAt: 1,
    phase: 'inquiry',
    mode: 'flood',
    currentAlarm: null,
    auth: { accessToken: 'migration-e2e', sessionId: 'migration-session' },
    user: { userId: 'migration-user' },
    seat: { seatNumber: 'migration-seat' },
  }
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await writer.evaluate((snapshot) => localStorage.setItem('seat-shared-state', JSON.stringify(snapshot)), shared)
  // 合并归一（路线 X）：flood 不再跳路由，调派 UI 改在 /map 内按 variant 渲染（.dispatch-page 专属）。
  // 收到 storage 事件后 useUserStore 更新 → dispatchVariant 翻转 → DispatchMapPage 渲染。
  await expect(page.locator('.dispatch-page')).toBeVisible({ timeout: 60_000 })
  await writer.evaluate((snapshot) => localStorage.setItem('seat-shared-state', JSON.stringify(snapshot)), {
    ...shared,
    updatedAt: 2,
    phase: 'onDuty',
    mode: 'normal',
  })
  // 退出 flood / 非调派 stage → dispatchVariant=false → 主 Map 包装层渲染，调派 UI 隐藏。
  await expect(page.locator('.dispatch-page')).toBeHidden({ timeout: 60_000 })
  expect(page.url()).toMatch(/#\/map/)
  expect(errors).toEqual([])
  await writer.close()
})

test('Given 库入口 When 挂载卸载两次再重新挂载 Then 新实例仍可正常接收storage导航；回归 Control 生命周期', async ({
  page,
  context,
}) => {
  await page.route('**/__mount-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html><body><div id="app"></div></body></html>' }),
  )
  await page.goto('/__mount-test')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.evaluate(async () => {
    const moduleUrl = '/src/lib/index.ts'
    const { mountApp } = await import(moduleUrl)
    const first = mountApp({ container: '#app' })
    first.unmount()
    first.unmount()
    mountApp({ container: '#app' })
  })
  await expect(page.locator('.input-search-btn')).toBeVisible({ timeout: 60_000 })
  const writer = await context.newPage()
  await writer.route('**/__storage-writer', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' }),
  )
  await writer.goto('/__storage-writer')
  await writer.evaluate(() =>
    localStorage.setItem(
      'seat-shared-state',
      JSON.stringify({
        v: 1,
        updatedAt: 1,
        phase: 'inquiry',
        mode: 'flood',
        currentAlarm: null,
        auth: { accessToken: 'migration-e2e', sessionId: 'migration-session' },
        user: { userId: 'migration-user' },
        seat: { seatNumber: 'migration-seat' },
      }),
    ),
  )
  // 合并归一（路线 X）：flood 不跳路由，库入口 storage 事件驱动 useUserStore 更新后
  // dispatchVariant 翻转，DispatchMapPage 在 /map 内渲染（.dispatch-page 专属）。
  await expect(page.locator('.dispatch-page')).toBeVisible({ timeout: 60_000 })
  expect(errors).toEqual([])
  await writer.close()
})
