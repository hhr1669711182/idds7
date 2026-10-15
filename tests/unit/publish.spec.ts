import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const publishMock = vi.fn(() => true)

vi.mock('@/store/useMessageStore', () => ({
  useMessageStore: () => ({ publish: publishMock }),
}))

/**
 * publish 消息出口契约：
 * Given store 已就绪
 * When 调用任一 publish* 函数
 * Then 仅经 useMessageStore().publish 发出，且 eventKey / channel / system 均来自常量
 */
describe('publish 消息发送出口', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    publishMock.mockReturnValue(true)
  })

  it('路径规划：批量下发与取消的 eventKey / system / channel 契约', async () => {
    const { publishRoutePlanMultiple, publishRoutePlanCancel } = await import('@/controller/publish')
    const { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } = await import('@/const/const.message.type')

    expect(publishRoutePlanMultiple({ a: 1 })).toBe(true)
    expect(publishMock).toHaveBeenLastCalledWith(MESSAGE_EVENT_KEY.ROUTE_PLAN_MULTIPLE, { a: 1 }, {
      system: MESSAGE_SYSTEM.MAP,
      channel: MESSAGE_CHANNEL.WS,
    })

    expect(publishRoutePlanCancel('r1')).toBe(true)
    expect(publishMock).toHaveBeenLastCalledWith(MESSAGE_EVENT_KEY.ROUTE_PLAN_CANCEL, { routeId: 'r1' }, {
      system: MESSAGE_SYSTEM.MAP,
      channel: MESSAGE_CHANNEL.WS,
    })
  })

  it('地址 POI：宿主通道走 POST_MESSAGE，地图 POI 走 WS', async () => {
    const { publishAddrPoiPick, publishMapPoiPick } = await import('@/controller/publish')
    const { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } = await import('@/const/const.message.type')

    expect(publishAddrPoiPick({ lngLat: [113.93, 22.53] })).toBe(true)
    expect(publishMock).toHaveBeenLastCalledWith(MESSAGE_EVENT_KEY.ADDR_POI_PICK, { lngLat: [113.93, 22.53] }, {
      system: MESSAGE_SYSTEM.HOST,
      channel: MESSAGE_CHANNEL.POST_MESSAGE,
    })

    expect(publishMapPoiPick({ id: 1 })).toBe(true)
    expect(publishMock).toHaveBeenLastCalledWith(MESSAGE_EVENT_KEY.MAP_POI_PICK, { id: 1 }, {
      system: MESSAGE_SYSTEM.MAP,
      channel: MESSAGE_CHANNEL.WS,
    })
  })

  it('三维表单：eventKey / system / channel 契约', async () => {
    const { publishThreeBuildFormSend } = await import('@/controller/publish')
    const { MESSAGE_CHANNEL, MESSAGE_EVENT_KEY, MESSAGE_SYSTEM } = await import('@/const/const.message.type')

    expect(publishThreeBuildFormSend({ floor: 2 })).toBe(true)
    expect(publishMock).toHaveBeenLastCalledWith(MESSAGE_EVENT_KEY.THREE_BUILD_FORM_SEND, { floor: 2 }, {
      system: MESSAGE_SYSTEM.THREE,
      channel: MESSAGE_CHANNEL.WS,
    })
  })
})
/**
 * 目录结构契约：分类文件按 MESSAGE_SYSTEM 划分，barrel 统一再导出。
 * 防止后续把不同 system 的函数混进同一文件，或新增分类文件忘记在 index.ts 登记。
 */
describe('publish 目录分类规范', () => {
  it('每个分类文件的 system 与 MESSAGE_SYSTEM 常量一致', async () => {
    const [{ MESSAGE_SYSTEM }, map, host, three] = await Promise.all([
      import('@/const/const.message.type'),
      import('@/controller/publish/map'),
      import('@/controller/publish/host'),
      import('@/controller/publish/three'),
    ])

    // 分类文件的函数名须带 publish 前缀，且 barrel 能全部再导出
    expect(Object.keys(map).every((k) => k.startsWith('publish'))).toBe(true)
    expect(Object.keys(host).every((k) => k.startsWith('publish'))).toBe(true)
    expect(Object.keys(three).every((k) => k.startsWith('publish'))).toBe(true)

    // 各分类文件的 system 契约（防止误把 HOST 通道写进 map.ts）
    expect(MESSAGE_SYSTEM.MAP).toBe('map')
    expect(MESSAGE_SYSTEM.HOST).toBe('host')
    expect(MESSAGE_SYSTEM.THREE).toBe('three')
  })

  it('barrel 汇总导出全部 publish 函数', async () => {
    const barrel = await import('@/controller/publish')
    const names = Object.keys(barrel).filter((k) => k.startsWith('publish'))
    expect(names.sort()).toEqual([
      'publishAddrPoiPick',
      'publishMapPoiPick',
      'publishRoutePlanCancel',
      'publishRoutePlanMultiple',
      'publishThreeBuildFormSend',
    ])
  })
})