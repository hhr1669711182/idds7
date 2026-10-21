import { expect, test } from '@playwright/test'

/**
 * 主题契约 E2E：Element Plus 夜间科技主题变量是否真实生效。
 *
 * 契约四要素：
 *   Given  应用已挂载，默认 data-theme="NIGHT"
 *   When   读取 :root 上的 --accent-cyan 与 --el-color-primary，切到 DAY 再读一次
 *   Then   夜间主色为科技青蓝 #22d3ee，--el-color-primary 派生自它；日间为 #3385ff
 *   回归   关联 herness/02-技术设计/前端/ElementPlus夜间科技主题-技术方案.md
 *
 * 约束：
 * - 只断言 CSS 变量值，不断言像素；
 * - --el-color-primary 可能是 var(--accent-cyan) 字面量，取计算值需用 getComputedStyle。
 */
const readVar = (page: import('@playwright/test').Page, name: string) =>
  page.evaluate((varName) => getComputedStyle(document.documentElement).getPropertyValue(varName).trim(), name)

test('夜间主题使用科技青蓝主色且 Element Plus 变量派生自它', async ({ page }) => {
  await page.goto('/#/map', { waitUntil: 'domcontentloaded' })

  const theme = await page.getAttribute('html', 'data-theme')
  expect(theme).toBe('NIGHT')

  const accentCyan = await readVar(page, '--accent-cyan')
  expect(accentCyan).toBe('#22d3ee')

  // Element Plus 主色应由项目强调色派生，计算值应与 --accent-cyan 一致
  const elPrimary = await readVar(page, '--el-color-primary')
  expect(elPrimary.toLowerCase()).toBe('#22d3ee')

  // 根变量必须真实存在（曾因 base.css 被拆到异步 chunk 而丢失）
  const elTextPrimary = await readVar(page, '--el-text-color-primary')
  expect(elTextPrimary).not.toBe('')
  const elBg = await readVar(page, '--el-bg-color')
  expect(elBg).not.toBe('')
})

test('切到日间主题后主色与 Element Plus 背景恢复浅色', async ({ page }) => {
  await page.goto('/#/map', { waitUntil: 'domcontentloaded' })

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'DAY'))
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'DAY')

  const accentCyan = await readVar(page, '--accent-cyan')
  expect(accentCyan).toBe('#3385ff')

  // 日间沿用 Element Plus 默认浅色背景
  const elBg = await readVar(page, '--el-bg-color')
  expect(elBg.toLowerCase()).toMatch(/^#(fff|ffffff)$/)
})
