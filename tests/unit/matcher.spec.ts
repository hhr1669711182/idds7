import { describe, expect, it } from 'vitest'
import { matchSubscription } from '@/interceptor/matcher'
import type { InterceptorContext, SubscribeRule } from '@/interceptor/types'

const ctx = (raw: unknown): InterceptorContext => ({ channel: 'ws', system: 'ids', raw })

/**
 * 订阅匹配四级兜底契约：
 * 1. topics[] 精确匹配
 * 2. notifyType / notifySubType 兜底（仅 CUSTOM）
 * 3. customContent.eventName 兜底（仅 CUSTOM，customType 与 key 各段驼峰后拼接 + Event）
 * 4. customContent.data 存在性且为非 null 对象（仅 CUSTOM）
 *
 * SEAT 订阅只做 topics 匹配，不走 2/3/4 级兜底。
 */
describe('interceptor/matcher 订阅匹配', () => {
  it('第 1 级：topics 精确命中（type 必中，customType / key 按需比对）', () => {
    const raw = { topics: [{ type: 'CUSTOM', customType: 'GIS', key: 'ALARM_ADD' }] }

    expect(matchSubscription(ctx(raw), { type: 'CUSTOM', customType: 'GIS', key: 'ALARM_ADD' })).toBe(true)
    expect(matchSubscription(ctx(raw), { type: 'CUSTOM', customType: 'GIS', key: 'ALARM_DEL' })).toBe(false)
    expect(matchSubscription(ctx(raw), { type: 'SEAT' })).toBe(false)
  })

  it('第 1 级：sub.key 为 null 时 topics 命中即通过（泛匹配）', () => {
    expect(matchSubscription(ctx({ topics: [{ type: 'SEAT', key: 'WHATEVER' }] }), { type: 'SEAT', key: null })).toBe(
      true,
    )
  })

  it('第 1 级：topics 大小写不敏感，订阅 rule 也按大写比对', () => {
    const raw = { topics: [{ type: 'custom', customType: 'gis', key: 'alarm_add' }] }
    expect(matchSubscription(ctx(raw), { type: 'CUSTOM', customType: 'GIS', key: 'ALARM_ADD' })).toBe(true)
  })

  it('第 2 级：CUSTOM 走 notifyType 兜底，未设 customType 时直接命中', () => {
    const raw = { notifyType: 'CUSTOM', notifySubType: 'GIS' }
    expect(matchSubscription(ctx(raw), { type: 'CUSTOM' })).toBe(true)
  })

  it('第 2 级：customType 与 notifyType 不一致 → 不命中', () => {
    const raw = { notifyType: 'CUSTOM', notifySubType: 'GIS' }
    expect(matchSubscription(ctx(raw), { type: 'CUSTOM', customType: 'OTHER' })).toBe(false)
  })

  it('第 2 级：key 与 CUSTOM_GIS 形式的合并 key 命中', () => {
    const raw = { notifyType: 'CUSTOM', notifySubType: 'GIS' }
    expect(matchSubscription(ctx(raw), { type: 'CUSTOM', key: 'CUSTOM_GIS' })).toBe(true)
  })

  it('第 2 级：notifyType 为空时不兜底（回归：空消息命中所有 CUSTOM 订阅）', () => {
    expect(matchSubscription(ctx({}), { type: 'CUSTOM' })).toBe(false)
  })

  it('第 3 级：CUSTOM 走 customContent.eventName 驼峰推导兜底', () => {
    // gis_alarm + add → GisAlarm + Add → GisAlarmAddEvent
    const raw = { customContent: { eventName: 'GisAlarmAddEvent' } }
    expect(matchSubscription(ctx(raw), { type: 'CUSTOM', customType: 'GIS_ALARM', key: 'ADD' })).toBe(true)
    // eventName 不匹配 → 该级不命中
    expect(matchSubscription(ctx(raw), { type: 'CUSTOM', customType: 'GIS_ALARM', key: 'DEL' })).toBe(false)
  })

  it('第 3 级：缺 customType 或 key 时不推导 eventName', () => {
    const raw = { customContent: { eventName: 'GisAlarmAddEvent' } }
    expect(matchSubscription(ctx(raw), { type: 'CUSTOM', key: 'ADD' })).toBe(false)
    expect(matchSubscription(ctx(raw), { type: 'CUSTOM', customType: 'GIS_ALARM' })).toBe(false)
  })

  it('第 4 级：CUSTOM 走 customContent.data 为非 null 对象的兜底', () => {
    expect(matchSubscription(ctx({ customContent: { data: { a: 1 } } }), { type: 'CUSTOM' })).toBe(true)
    expect(matchSubscription(ctx({ customContent: { data: [] } }), { type: 'CUSTOM' })).toBe(true)
    // data 为 null 或原始值 → 不命中
    expect(matchSubscription(ctx({ customContent: { data: null } }), { type: 'CUSTOM' })).toBe(false)
    expect(matchSubscription(ctx({ customContent: { data: 'text' } }), { type: 'CUSTOM' })).toBe(false)
  })

  it('SEAT 订阅不走 2/3/4 级兜底（回归：SEAT 串订阅）', () => {
    const raw = {
      notifyType: 'CUSTOM',
      notifySubType: 'GIS',
      customContent: { eventName: 'GisAlarmAddEvent', data: { a: 1 } },
    }
    expect(matchSubscription(ctx(raw), { type: 'SEAT' })).toBe(false)
  })

  it('raw 非对象时返回 false，不抛错（回归：裸 string / null 上抛）', () => {
    expect(matchSubscription(ctx(null), { type: 'CUSTOM' })).toBe(false)
    expect(matchSubscription(ctx('str'), { type: 'SEAT' })).toBe(false)
  })

  it('sub.type 为 undefined（脏配置）时不命中任何非 CUSTOM 规则', () => {
    expect(matchSubscription(ctx({ topics: [{ type: 'CUSTOM' }] }), { type: undefined as unknown as string })).toBe(
      false,
    )
  })
})
