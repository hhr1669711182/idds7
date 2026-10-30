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
  await expect(page).toHaveURL(/#\/dispatch/, { timeout: 60_000 })
  await writer.evaluate((snapshot) => localStorage.setItem('seat-shared-state', JSON.stringify(snapshot)), {
    ...shared,
    updatedAt: 2,
    phase: 'onDuty',
    mode: 'normal',
  })
  await expect(page).toHaveURL(/#\/map/, { timeout: 60_000 })
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
  await expect(page).toHaveURL(/#\/dispatch/, { timeout: 60_000 })
  expect(errors).toEqual([])
  await writer.close()
})
