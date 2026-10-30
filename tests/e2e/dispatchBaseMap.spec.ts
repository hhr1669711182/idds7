import { expect, test, type BrowserContext, type Page } from '@playwright/test'

/**
 * 合并后底座交互回归 E2E（统一底座共用层 useGisBaseMap 落地后，/map 与 /dispatch 共用 WMS 层）。
 *
 * 覆盖两条关键路径（路由切换由 controlMigration.spec.ts 已覆盖，此处补齐业务链路）：
 *  1) 终态警情 → 车辆历史轨迹（假数据模拟）：进 /dispatch 时 onMounted 恢复链路
 *     （detail 取 vehicleId → track 喂假轨迹点）。用 page.route 拦截两个外部 API 注入
 *     假数据，断言 track 请求被真实消费 + 全程无未捕获异常；
 *  2) 模拟调派（跨 tab 写入 seat-shared-state-mock 注入 dispatchVehicles）：
 *     驱动 MOCK_DISPATCH_VEHICLES 事件被 DispatchT1 消费，全程无崩溃。
 *
 * 约束：
 * - WMS 本体瓦片 / 图层渲染依赖真实数据源（浏览器已加载），不在 E2E 断言像素；
 * - 轨迹 / 车辆模拟最终落到 canvas，不逐像素断言，以「请求被消费 + 无 pageerror」为回归底线。
 */

const INCIDENT_ID = 'INC-TRACK'
const VEHICLE_ID = 'V-TRACK-1'

const fakeTrackPoints = [
  { carId: VEHICLE_ID, plateNumber: '贵A·1', longitude: 106.7, latitude: 26.6, gpsTime: '2026-08-17 16:00:00' },
  { carId: VEHICLE_ID, plateNumber: '贵A·1', longitude: 106.71, latitude: 26.61, gpsTime: '2026-08-17 16:30:00' },
  { carId: VEHICLE_ID, plateNumber: '贵A·1', longitude: 106.72, latitude: 26.62, gpsTime: '2026-08-17 17:00:00' },
]

/** 可进入 /dispatch 的共享态：mode=flood 由 sharedStateGuard 强制跳 dispatch；currentAlarm 用于轨迹恢复门控。 */
const seedShared = (currentAlarm: Record<string, unknown> | null) => ({
  v: 1,
  updatedAt: 1,
  phase: 'inquiry',
  mode: 'flood',
  currentAlarm,
  auth: { accessToken: 'track-e2e', sessionId: 'track-session' },
  user: { userId: 'track-user' },
  seat: { seatNumber: 'track-seat' },
})

/** storage 事件只在跨 tab 触发：开一个同 context 的 writer tab 写入，主 page 监听。 */
async function makeWriter(context: BrowserContext): Promise<Page> {
  const writer = await context.newPage()
  await writer.route('**/__storage-writer', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<html></html>' }),
  )
  await writer.goto('/__storage-writer')
  return writer
}

/** dev server 冷启动时先预热，再取页面（与 smoke 一致）。 */
const warmup = async (page: Page) => {
  await page.goto('/#/map')
  const inputButton = page.locator('.input-search-btn')
  try {
    await inputButton.waitFor({ state: 'visible', timeout: 30_000 })
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await inputButton.waitFor({ state: 'visible', timeout: 30_000 })
  }
}

test('终态警情 When 进 /dispatch 则历史轨迹链路消费假轨迹数据且无崩溃', async ({ page, context }) => {
  let detailCalls = 0
  let trackCalls = 0
  // detail：返回含 vehicleId 的假警情详情，供 extractLatestBatchFirstVehicleId 提取
  await page.route(`**/bff-client/api/v1/gis/incidents/${INCIDENT_ID}/detail`, (route) => {
    detailCalls += 1
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: 'ok',
        code: 200,
        data: { dispatchInfo: { batches: [{ seq: 1, stations: [{ vehicles: [{ vehicleId: VEHICLE_ID }] }] }] } },
        timestamp: Date.now(),
      }),
    })
  })
  // track：喂假轨迹点（经纬度合法，可直接上图）
  await page.route('**/car-track-api/api/car/track/query', (route) => {
    trackCalls += 1
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'ok', code: 200, data: fakeTrackPoints, timestamp: Date.now() }),
    })
  })

  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await warmup(page)
  const writer = await makeWriter(context)
  // 终态警情（lifecycleStage=closed）→ 进 /dispatch 时 onMounted 恢复轨迹链路
  await writer.evaluate(
    (s) => localStorage.setItem('seat-shared-state', JSON.stringify(s)),
    seedShared({ incidentId: INCIDENT_ID, lifecycleStage: 'closed' }),
  )

  await expect(page).toHaveURL(/#\/dispatch/, { timeout: 60_000 })
  // 链路跑通：detail 取到 vehicleId → track 被真实请求。两个请求都被消费即底座轨迹链路无中断。
  await expect
    .poll(() => trackCalls, { timeout: 30_000, message: '历史轨迹请求未发出（detail→vehicleId→track 链路中断）' })
    .toBeGreaterThanOrEqual(1)
  expect(detailCalls).toBeGreaterThanOrEqual(1)
  expect(errors, `未捕获异常：\n${errors.join('\n')}`).toEqual([])
  await writer.close()
})

test('模拟调派 When 注入 seat-shared-state-mock 则车辆事件被消费且无崩溃', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await warmup(page)
  const writer = await makeWriter(context)
  // 先进 /dispatch（flood + 带 currentAlarm，stage=dispatch 可停留）
  await writer.evaluate((s) => localStorage.setItem('seat-shared-state', JSON.stringify(s)), seedShared({ incidentId: INCIDENT_ID }))
  await expect(page).toHaveURL(/#\/dispatch/, { timeout: 60_000 })

  // 注入模拟调派车辆清单：storage 事件驱动 MOCK_DISPATCH_VEHICLES，DispatchT1 校验队站后触发模拟跟踪
  const mock = {
    v: 1,
    updatedAt: 1,
    dispatchVehicles: [{ vehicleId: 'V-MOCK-1', stationId: 'S1', stationName: '一号消防站' }],
  }
  await writer.evaluate((m) => localStorage.setItem('seat-shared-state-mock', JSON.stringify(m)), mock)
  // 给事件消费 + 模拟跟踪启动留时间（canvas 动画不断言像素，以无崩溃为底线）
  await page.waitForTimeout(2000)

  expect(page.url()).toMatch(/#\/dispatch/)
  expect(errors, `未捕获异常：\n${errors.join('\n')}`).toEqual([])
  await writer.close()
})
