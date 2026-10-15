import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyTextToClipboard } from '@/utils/clipboard'
import { formatLngLat } from '@/utils/coordTransform'

/**
 * 剪贴板与经纬度格式化的公共契约：
 * - formatLngLat 输出 `经度,纬度`（6 位小数），与 copyCoord 复制格式一致
 * - copyTextToClipboard 统一处理写入成功 / 权限被拒两类结果
 */
describe('utils/clipboard + coordTransform 公共能力', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('formatLngLat 输出「经度,纬度」且保留 6 位小数', () => {
    expect(formatLngLat([113.9354071, 22.54831])).toBe('113.935407,22.548310')
    expect(formatLngLat([113.5, 22.5], 3)).toBe('113.500,22.500')
  })

  it('写入成功时返回 true 并回调 success 提示', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const notify = vi.fn()

    await expect(copyTextToClipboard('113.9,22.5', { notify })).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('113.9,22.5')
    expect(notify).toHaveBeenCalledWith('success', '已复制：113.9,22.5')
  })

  it('successText 为 false 时不弹成功提示', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const notify = vi.fn()

    await copyTextToClipboard('text', { successText: false, notify })
    expect(notify).not.toHaveBeenCalled()
  })

  it('写入被拒时返回 false 并回调 warning 提示', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const notify = vi.fn()

    await expect(copyTextToClipboard('text', { notify })).resolves.toBe(false)
    expect(notify).toHaveBeenCalledWith('warning', expect.stringContaining('剪贴板'))
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('deniedText 可覆盖失败文案', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const notify = vi.fn()

    await copyTextToClipboard('text', { deniedText: '复制失败', notify })
    expect(notify).toHaveBeenCalledWith('warning', '复制失败')
  })
})