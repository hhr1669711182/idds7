import { describe, expect, it } from 'vitest'
import { getLocationType } from '@/baseComponent/tools/Common'

describe('tools/Common getLocationType', () => {
  // 等价类：已知码 → 标签
  it.each([
    ['SJDW', '手机定位'],
    ['WZWDW-GPS_s', '位置网精准定位'],
  ])('码 %s 映射为 %s', (code, label) => {
    expect(getLocationType(code)).toBe(label)
  })

  // 边界：未知码与 undefined 均回退「未知」
  it('未知码与无参均返回「未知」', () => {
    expect(getLocationType('unknown')).toBe('未知')
    expect(getLocationType()).toBe('未知')
  })
})
