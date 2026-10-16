import { describe, expect, it } from 'vitest'
import { isPlainObject, normalize, unwrapMessageFrames } from '@/interceptor/unwrap'

/**
 * 消息归一（通用层）契约：
 * - content / customContent 是 JSON 字符串时自动 parse，非对象一律归 null；
 * - topics 内的 type / customType 大写归一，key 转字符串；
 * - 非对象入参返回 null（不抛错，由调用方决定忽略）。
 */
describe('interceptor/unwrap 消息体归一', () => {
  it('isPlainObject 区分对象 / 数组 / null / 原始值', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject('str')).toBe(false)
    expect(isPlainObject(1)).toBe(false)
  })

  it('content / customContent 为 JSON 字符串时自动解析为对象', () => {
    const result = normalize({
      content: '{"a":1}',
      customContent: '{"b":2}',
    })

    expect(result).not.toBeNull()
    expect(result!.content).toEqual({ a: 1 })
    expect(result!.customContent).toEqual({ b: 2 })
  })

  it('content 为非 JSON 字符串或非对象时归 null（回归：脏数据导致下游崩溃）', () => {
    const result = normalize({ content: 'not-json', customContent: 42 })

    expect(result!.content).toBeNull()
    expect(result!.customContent).toBeNull()
  })

  it('topics 的 type / customType 大写归一，key 转字符串', () => {
    const result = normalize({
      topics: [
        { type: 'custom', customType: 'gis', key: 123 },
        { type: 'seat', key: 'abc' },
      ],
    })

    expect(result!.topics).toEqual([
      { type: 'CUSTOM', customType: 'GIS', key: '123' },
      { type: 'SEAT', key: 'abc' },
    ])
  })

  it('topics 内的非法项被丢弃，非数组 topics 归空数组', () => {
    const result = normalize({ topics: [null, 'x', { type: 'custom' }] })
    expect(result!.topics).toEqual([{ type: 'CUSTOM' }])

    const notArray = normalize({ topics: 'custom' })
    expect(notArray!.topics).toEqual([])
  })

  it('notifyType / notifySubType 大写归一，缺失时为空串', () => {
    const result = normalize({ notifyType: 'custom', notifySubType: 'gis' })
    expect(result!.notifyType).toBe('CUSTOM')
    expect(result!.notifySubType).toBe('GIS')

    const empty = normalize({})
    expect(empty!.notifyType).toBe('')
    expect(empty!.notifySubType).toBe('')
  })

  it('非对象入参返回 null（回归：裸 string / null 上抛）', () => {
    expect(normalize(null)).toBeNull()
    expect(normalize('message')).toBeNull()
    expect(normalize(123)).toBeNull()
    expect(normalize([])).toBeNull()
  })

  it.each([
    { notifyType: { toString: null } },
    { notifySubType: { toString: null } },
    { notifyTypeDto: { notifyType: { toString: null } } },
    { topics: [{ type: { toString: null } }] },
    { topics: [{ type: 'CUSTOM', customType: { toString: null } }] },
    { topics: [{ type: 'CUSTOM', key: { toString: null } }] },
  ])('Given 无法转字符串的路由字段 %j When 批量解包 Then 仅隔离坏帧并保留合法兄弟', (badFrame) => {
    const first = { content: { callId: 'first' } }
    const last = { content: { callId: 'last' } }
    expect(normalize(badFrame)).toBeNull()
    const result = unwrapMessageFrames([first, badFrame, last])
    expect(result.map((frame) => frame.value)).toEqual([first, last])
  })
})
