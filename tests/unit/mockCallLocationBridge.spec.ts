import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

const harness = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  ingest: vi.fn(),
}))

vi.mock('@/store/useUserStore', () => ({ useUserStore: () => harness.state }))
vi.mock('@/store', () => ({ useUserStore: () => harness.state }))
vi.mock('@/store/useMessageStore', () => ({ useMessageStore: () => ({ ingest: harness.ingest }) }))

import { createMockCallLocationBridge, consumePendingSpecialMapRender } from '@/composables/useMockCallLocationBridge'
import { MESSAGE_EVENT_KEY as KEY, MOCK_CALL_LOCATION_ID } from '@/const/const.message.type'

const shared = (mode: string, updatedAt = 1) => ({ v: 1, updatedAt, mode })
const blob = (fields: Record<string, unknown>, updatedAt = 1) => JSON.stringify({ v: 1, updatedAt, ...fields })
const fields = () => ({
  callLocation: { lng: 116, lat: 39, address: '测试地址' },
  dispatchVehicles: [{ vehicleId: 'V1', stationId: 'S1' }],
  disasterSite: { id: 'site-1' },
  flood: { dispatchCommand: { id: 'command-1' } },
})
const keys = () => harness.ingest.mock.calls.map(([envelope]) => envelope.eventKey)
const commitMock = (raw: string | null) => {
  harness.state.seatSharedStateMockRaw = raw
  harness.state.mockRevision = Number(harness.state.mockRevision) + 1
}
const commitShared = (mode: string, epoch = Number(harness.state.sessionEpoch)) => {
  harness.state.rawState = shared(mode)
  harness.state.mode = mode
  harness.state.sessionEpoch = epoch
  harness.state.sharedStateRevision = Number(harness.state.sharedStateRevision) + 1
}

describe('F10 committed store bridge（回归 Control 迁移 F10）', () => {
  const cleanups: Array<() => void> = []
  const start = (options: Record<string, unknown> = {}) => {
    const bridge = Reflect.apply(createMockCallLocationBridge, undefined, [options])
    if (bridge.dispose) cleanups.push(bridge.dispose)
    return bridge
  }

  beforeEach(() => {
    harness.state = reactive({
      rawState: shared('normal'),
      mode: 'normal',
      MapMode: 'inquiry',
      sharedStateRevision: 1,
      seatSharedStateMockRaw: null,
      mockRevision: 1,
      sessionEpoch: 1,
    })
    harness.ingest.mockReset()
  })
  afterEach(() => {
    cleanups.splice(0).forEach((dispose) => dispose())
  })

  it('Given startup blob 含全部字段 When 创建桥 Then 仅恢复 call/flood，其他字段建立基线', () => {
    harness.state.rawState = shared('flood')
    harness.state.mode = 'flood'
    harness.state.seatSharedStateMockRaw = blob(fields())
    const requestNavigation = vi.fn()
    start({ requestNavigation })
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_RENDER, KEY.MAP_LOCATE_CALL])
    expect(requestNavigation).toHaveBeenCalledWith(expect.objectContaining({ path: '/dispatch', sessionEpoch: 1 }))
    harness.ingest.mockClear()
    commitMock(blob(fields(), 2))
    expect(keys()).toEqual([])
  })

  it('Given 空基线 When 同一 blob 提交四字段 Then 独立投递且不因更新时间重放', () => {
    start()
    commitShared('flood')
    harness.ingest.mockClear()
    commitMock(blob(fields()))
    expect(keys()).toEqual([
      KEY.MAP_LOCATE_CALL,
      KEY.MOCK_DISPATCH_VEHICLES,
      KEY.MOCK_SPECIAL_MAP_DISASTER_SITE,
      KEY.MOCK_SPECIAL_MAP_SIMULATE,
    ])
    for (const [envelope, channel, , meta] of harness.ingest.mock.calls) {
      expect(channel).toBe('localStorage')
      expect(envelope.channel).toBe('localStorage')
      expect(meta).toMatchObject({ mock: true, sessionEpoch: 1 })
    }
    harness.ingest.mockClear()
    commitMock(blob({ ...fields(), disasterSite: { id: 'site-2' } }, 2))
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_DISASTER_SITE])
  })

  it('Given 未提交字段 When 仅改 raw/mode Then 不运行；提交 revision 后才处理', () => {
    start()
    harness.state.seatSharedStateMockRaw = blob(fields())
    harness.state.rawState = shared('flood')
    harness.state.mode = 'flood'
    expect(keys()).toEqual([])
    harness.state.sharedStateRevision = 2
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_RENDER])
    harness.state.mockRevision = 2
    expect(keys()).toHaveLength(5)
  })

  it('Given 已启动桥 When mock blob 提交 Then 一次解析；shared 修订不重复解析', () => {
    start()
    const raw = blob(fields())
    const parse = vi.spyOn(JSON, 'parse')
    commitMock(raw)
    commitShared('normal')
    expect(parse.mock.calls.filter(([value]) => value === raw)).toHaveLength(1)
    parse.mockRestore()
  })

  it('Given flood pending When 退出/同 flood 修订 Then 先撤 pending 再 clear，phase 更新不重置', () => {
    start()
    commitShared('flood')
    harness.ingest.mockClear()
    commitShared('flood')
    expect(keys()).toEqual([])
    harness.ingest.mockImplementation((envelope) => {
      if (envelope.eventKey === KEY.MOCK_SPECIAL_MAP_CLEAR) expect(consumePendingSpecialMapRender()).toBe(false)
    })
    commitShared('normal')
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_CLEAR])
    expect(consumePendingSpecialMapRender()).toBe(false)
  })

  it('Given flood 会话 When epoch 变更 Then 旧上下文作废且不重放 site/command', () => {
    const bridge = start()
    commitShared('flood')
    commitMock(blob(fields()))
    const context = harness.ingest.mock.calls.at(-1)?.[3]
    harness.ingest.mockClear()
    commitShared('flood', 2)
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_CLEAR, KEY.MOCK_SPECIAL_MAP_RENDER])
    expect(bridge.isCurrent(context)).toBe(false)
  })

  it('Given 非 flood When site/command 提交后进入 flood Then 不重放此前指令', () => {
    start()
    commitMock(blob(fields()))
    expect(keys()).toEqual([KEY.MAP_LOCATE_CALL, KEY.MOCK_DISPATCH_VEHICLES])
    harness.ingest.mockClear()
    commitShared('flood')
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_RENDER])
  })

  it('Given mock 删除或旧二次定位字段 When 提交 Then 只删除指定模拟 call，忽略旧 storage 分支', () => {
    start()
    commitMock(blob({ isSecondJQLocation: true, incidentID: 'I1' }))
    expect(keys()).toEqual([])
    commitMock(null)
    expect(keys()).toEqual([KEY.MAP_LOCATE_CALL_REMOVE])
    expect(harness.ingest.mock.calls[0][0].data).toEqual({ id: MOCK_CALL_LOCATION_ID })
  })

  it('Given 已删除 mock When 重复收到删除提交 Then 不重复发布 call remove', () => {
    start()
    commitMock(blob(fields()))
    harness.ingest.mockClear()
    commitMock(null)
    commitMock(null)
    expect(keys()).toEqual([KEY.MAP_LOCATE_CALL_REMOVE])
  })

  it('Given render 事件同步触发退出 When 桥准备导航 Then 不请求过期 flood 导航', () => {
    const requestNavigation = vi.fn()
    start({ requestNavigation })
    harness.ingest.mockImplementation((envelope) => {
      if (envelope.eventKey === KEY.MOCK_SPECIAL_MAP_RENDER) commitShared('normal')
    })
    commitShared('flood')
    expect(requestNavigation).not.toHaveBeenCalled()
    expect(consumePendingSpecialMapRender()).toBe(false)
  })

  it('Given malformed/无效版本 When 提交 Then 忽略且后续有效字段仍可生效', () => {
    start()
    commitMock('{')
    commitMock(JSON.stringify({ v: 2, updatedAt: 1, ...fields() }))
    expect(keys()).toEqual([])
    commitMock(blob({ callLocation: { lng: 116, lat: 39 } }))
    expect(keys()).toEqual([KEY.MAP_LOCATE_CALL])
  })

  it('Given 活跃 flood When dispose 后继续提交 Then pending 已撤销且不再分发', () => {
    const bridge = start()
    commitShared('flood')
    bridge.dispose?.()
    expect(consumePendingSpecialMapRender()).toBe(false)
    harness.ingest.mockClear()
    commitMock(blob(fields()))
    commitShared('normal')
    expect(keys()).toEqual([])
  })

  it('Given 非 flood 有跨页车辆任务 When session 结束或 dispose Then 发 clear 撤销旧上下文任务', () => {
    const bridge = start()
    commitMock(blob({ dispatchVehicles: [{ vehicleId: 'V1' }] }))
    harness.ingest.mockClear()
    commitShared('normal', 2)
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_CLEAR])
    commitMock(blob({ dispatchVehicles: [{ vehicleId: 'V2' }] }, 2))
    harness.ingest.mockClear()
    bridge.dispose()
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_CLEAR])
  })

  it('Given call 订阅同步换会话 When 原 blob 还有车辆/灾害点/命令 Then 旧分支不得继承新 epoch/generation；回归 F10 审查 R2', () => {
    const bridge = start()
    commitShared('flood')
    const originalContext = bridge.getContext()
    harness.ingest.mockClear()
    harness.ingest.mockImplementation((envelope) => {
      if (envelope.eventKey === KEY.MAP_LOCATE_CALL) commitShared('flood', 2)
    })
    commitMock(blob(fields()))
    expect(keys()).toEqual([KEY.MAP_LOCATE_CALL, KEY.MOCK_SPECIAL_MAP_CLEAR, KEY.MOCK_SPECIAL_MAP_RENDER])
    expect(harness.ingest.mock.calls[0][3]).toMatchObject(originalContext)
    expect(bridge.isCurrent(originalContext)).toBe(false)
  })

  it('Given 同轮车辆订阅退出 flood When 后续还有 site/command Then 不发送已撤销的分支；回归 F10 审查 R2', () => {
    start()
    commitShared('flood')
    harness.ingest.mockClear()
    harness.ingest.mockImplementation((envelope) => {
      if (envelope.eventKey === KEY.MOCK_DISPATCH_VEHICLES) commitShared('normal')
    })
    commitMock(blob(fields()))
    expect(keys()).toEqual([KEY.MAP_LOCATE_CALL, KEY.MOCK_DISPATCH_VEHICLES, KEY.MOCK_SPECIAL_MAP_CLEAR])
  })

  it('Given call 订阅同步提交新版 mock When 原轮继续 Then 仅新版快照发送后续字段；回归 F10 审查 R2', () => {
    start()
    commitShared('flood')
    harness.ingest.mockClear()
    harness.ingest.mockImplementation((envelope) => {
      if (envelope.eventKey === KEY.MAP_LOCATE_CALL && envelope.data.longitude === 116) {
        commitMock(
          blob(
            {
              callLocation: { lng: 117, lat: 40 },
              dispatchVehicles: [{ vehicleId: 'V2' }],
              disasterSite: { id: 'site-2' },
              flood: { dispatchCommand: { id: 'C2' } },
            },
            2,
          ),
        )
      }
    })
    commitMock(blob(fields()))
    expect(keys()).toEqual([
      KEY.MAP_LOCATE_CALL,
      KEY.MAP_LOCATE_CALL,
      KEY.MOCK_DISPATCH_VEHICLES,
      KEY.MOCK_SPECIAL_MAP_DISASTER_SITE,
      KEY.MOCK_SPECIAL_MAP_SIMULATE,
    ])
    expect(harness.ingest.mock.calls[2][0].data).toEqual([{ vehicleId: 'V2' }])
    expect(harness.ingest.mock.calls[2][3]).toMatchObject({ mockRevision: 3, mockUpdatedAt: 2 })
  })

  it('Given 命令有明确 ID When C1 状态变更再 C2 再 C1 Then 每个 ID 只执行一次；回归 F10 审查 R3', () => {
    start()
    commitShared('flood')
    harness.ingest.mockClear()
    const command = (id: string, status: string, updatedAt: number) =>
      commitMock(blob({ flood: { dispatchCommand: { id, status } } }, updatedAt))
    command('C1', 'created', 1)
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_SIMULATE])
    command('C1', 'running', 2)
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_SIMULATE])
    command('C2', 'created', 3)
    command('C1', 'completed', 4)
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_SIMULATE, KEY.MOCK_SPECIAL_MAP_SIMULATE])
  })

  it('Given startup 命令 C1 仅作基线 When 同 ID 内容更新或 C2 后回到 C1 Then 不补执行 C1；回归 F10 审查 R3', () => {
    harness.state.rawState = shared('flood')
    harness.state.mode = 'flood'
    harness.state.seatSharedStateMockRaw = blob({ flood: { dispatchCommand: { id: 'C1', status: 'created' } } })
    start()
    harness.ingest.mockClear()
    commitMock(blob({ flood: { dispatchCommand: { id: 'C1', status: 'running' } } }, 2))
    expect(keys()).toEqual([])
    commitMock(blob({ flood: { dispatchCommand: { id: 'C2' } } }, 3))
    commitMock(blob({ flood: { dispatchCommand: { id: 'C1' } } }, 4))
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_SIMULATE])
  })

  it('Given 命令无 ID When 相同内容重复及 A/B/A 边沿 Then 按内容变化执行；回归 F10 审查 R3', () => {
    start()
    commitShared('flood')
    harness.ingest.mockClear()
    for (const [index, action] of ['A', 'A', 'B', 'A'].entries()) {
      commitMock(blob({ flood: { dispatchCommand: { action } } }, index + 1))
    }
    expect(keys()).toEqual([
      KEY.MOCK_SPECIAL_MAP_SIMULATE,
      KEY.MOCK_SPECIAL_MAP_SIMULATE,
      KEY.MOCK_SPECIAL_MAP_SIMULATE,
    ])
  })

  it('Given 会话内已见 C1/C2 When 删除 mock 或退出 flood 后重发 Then ID 去重保留，换会话后按新基线处理；回归 F10 审查 R3', () => {
    start()
    commitShared('flood')
    const command = (id: string) => commitMock(blob({ flood: { dispatchCommand: { id } } }))
    command('C1')
    command('C2')
    harness.ingest.mockClear()
    commitMock(null)
    command('C1')
    commitShared('normal')
    commitShared('flood')
    command('C2')
    expect(keys().filter((key) => key === KEY.MOCK_SPECIAL_MAP_SIMULATE)).toEqual([])
    commitShared('flood', 2)
    harness.ingest.mockClear()
    command('C2')
    command('C1')
    expect(keys()).toEqual([KEY.MOCK_SPECIAL_MAP_SIMULATE])
  })

  it.each(['lng', 'lat'])(
    'Given call.%s 无法转为数字 When 同包其他字段有效 Then 只忽略 call；回归 F10 审查 R4',
    (coordinate) => {
      start()
      commitShared('flood')
      harness.ingest.mockClear()
      commitMock(blob({ ...fields(), callLocation: { lng: 116, lat: 39, [coordinate]: { toString: null } } }))
      expect(keys()).toEqual([
        KEY.MOCK_DISPATCH_VEHICLES,
        KEY.MOCK_SPECIAL_MAP_DISASTER_SITE,
        KEY.MOCK_SPECIAL_MAP_SIMULATE,
      ])
    },
  )

  it('Given 相同原始 blob When mockRevision 重复递增 Then 在 JSON.parse 前去重；回归 F10 审查 R5', () => {
    start()
    const raw = blob(fields())
    const parse = vi.spyOn(JSON, 'parse')
    try {
      commitMock(raw)
      commitMock(raw)
      commitMock(raw)
      expect(parse.mock.calls.filter(([value]) => value === raw)).toHaveLength(1)
      expect(keys()).toEqual([KEY.MAP_LOCATE_CALL, KEY.MOCK_DISPATCH_VEHICLES])
    } finally {
      parse.mockRestore()
    }
  })

  it('Given malformed raw When revision 重复提交 Then 无效内容也只解析一次；回归 F10 审查 R5', () => {
    start()
    const parse = vi.spyOn(JSON, 'parse')
    try {
      commitMock('{')
      commitMock('{')
      expect(parse.mock.calls.filter(([value]) => value === '{')).toHaveLength(1)
      expect(keys()).toEqual([])
    } finally {
      parse.mockRestore()
    }
  })
})
