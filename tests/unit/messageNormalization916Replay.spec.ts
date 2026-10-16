import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebSocketOptions } from '@/hooks/useWebSocket'
import type { MessageEnvelope } from '@/types/message'
import type { AddressUpdatedData } from '@/controller/core/protocol/IncidentLocationProtocol'
import {
  MESSAGE_CHANNEL as CHANNEL,
  MESSAGE_EVENT_KEY as KEY,
  MESSAGE_SYSTEM as SYSTEM,
} from '@/const/const.message.type'
import {
  replayAddress,
  replayAddressbot,
  replayAnswer,
  replayFamilies,
  replayGps,
  replayIncident,
  replayPosition,
  replayProfile,
  replayWrappers,
} from '../fixtures/messageNormalizationReplay'

const transport = vi.hoisted(() => ({ clients: [] as WebSocketOptions[] }))
vi.mock('@/store', () => ({ useUserStore: () => ({ seatNumber: '8001' }) }))
vi.mock('@/hooks/useWebSocket', () => ({
  WebSocketClient: class {
    ws = { readyState: 1 }
    send = vi.fn(() => true)
    disconnect = vi.fn()
    constructor(_url: string, options: WebSocketOptions) {
      transport.clients.push(options)
    }
  },
}))

class ReplayStorage implements Storage {
  private values = new Map<string, string>()
  get length() {
    return this.values.size
  }
  clear() {
    this.values.clear()
  }
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

type Delivery = Pick<MessageEnvelope<unknown>, 'eventKey' | 'data'>
type ReplaySide = '916' | 'current'

const replay = async (side: ReplaySide, frames: unknown[], entry: 'ws' | 'ingest' = 'ws') => {
  vi.resetModules()
  const session = new ReplayStorage()
  const local = new ReplayStorage()
  vi.stubGlobal('sessionStorage', session)
  vi.stubGlobal('localStorage', local)
  const { createPinia, disposePinia } = await import('pinia')
  const { createApp } = await import('vue')
  const { default: persist } = await import('pinia-plugin-persistedstate')
  const { interceptorRegistry: registry } = await import('@/interceptor')
  const { useMessageStore } =
    side === '916' ? await import('@/store/useMessageStore916') : await import('@/store/useMessageStore')
  const pinia = createPinia().use(persist)
  createApp({}).use(pinia)
  registry.clear()
  const store = useMessageStore(pinia)
  const deliveries: Delivery[] = []
  const envelopes: MessageEnvelope<unknown>[] = []
  const cleanups: Array<() => void> = []
  try {
    expect(store.inbox).toEqual({})
    expect(registry.list()).toEqual([])
    for (const eventKey of new Set(Object.values(KEY))) {
      cleanups.push(
        store.subscribe(eventKey, (envelope: MessageEnvelope<unknown>) => {
          envelopes.push(envelope)
          deliveries.push({ eventKey: envelope.eventKey, data: envelope.data })
        }),
      )
    }
    const clientIndex = transport.clients.length
    cleanups.push(store.connectWebSocket({ url: 'ws://replay.invalid/message-client/ws', system: SYSTEM.IDS_SEAT_WEB }))
    const onMessage = transport.clients[clientIndex]?.onMessage
    expect(onMessage).toBeTypeOf('function')
    for (const frame of structuredClone(frames)) {
      if (entry === 'ingest') store.ingest(frame, CHANNEL.WS, SYSTEM.IDS_SEAT_WEB)
      else onMessage!(frame, new MessageEvent('message'))
    }
    const inbox: Delivery[] = (store.inbox[SYSTEM.IDS_SEAT_WEB] ?? []).map((envelope: MessageEnvelope<unknown>) => ({
      eventKey: envelope.eventKey,
      data: envelope.data,
    }))
    expect(inbox).toEqual(deliveries)
    store.$persist()
    const stored = session.getItem(side === '916' ? 'messageStore' : 'pinia:messageStore')
    expect(stored).not.toBeNull()
    return { deliveries, envelopes, store, pinia, registry, session, local, stored }
  } finally {
    cleanups.reverse().forEach((cleanup) => cleanup())
    store.$dispose()
    disposePinia(pinia)
    registry.clear()
    vi.unstubAllGlobals()
  }
}

const compare = async (frames: unknown[]) => ({
  legacy: await replay('916', frames),
  current: await replay('current', frames),
})

describe('Given 本地固定帧 When 916 WS 回调与新消息链隔离回放 Then 比较实际订阅顺序和完整 payload（Control 迁移回归）', () => {
  beforeEach(() => {
    transport.clients.length = 0
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('Given 同名 messageStore When 分别创建运行环境 Then Pinia/registry/storage 和 store 身份均隔离', async () => {
    const { legacy, current } = await compare([replayPosition])
    expect(legacy.store.$id).toBe('messageStore')
    expect(current.store.$id).toBe('messageStore')
    expect(current.store).not.toBe(legacy.store)
    expect(current.pinia).not.toBe(legacy.pinia)
    expect(current.registry).not.toBe(legacy.registry)
    expect(current.session).not.toBe(legacy.session)
    expect(current.local).not.toBe(legacy.local)
    expect(legacy.session.getItem('pinia:messageStore')).toBeNull()
    expect(current.session.getItem('messageStore')).toBeNull()
    expect(current.deliveries).toEqual(legacy.deliveries)
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.MAP_LOCATE_CALL])
  })

  it('Given 916 位置帧 When 分别调用 ingest 和 WS onMessage Then 仅 WS 入口执行完整归一', async () => {
    const ingested = await replay('916', [replayPosition], 'ingest')
    const websocket = await replay('916', [replayPosition])
    expect(ingested.deliveries).toEqual([])
    expect(websocket.deliveries.map((item) => item.eventKey)).toEqual([KEY.MAP_LOCATE_CALL])
  })

  it('Given F1-F7 顺序输入 When 两侧从 WS 回放 Then 每个事件与完整载荷均一致', async () => {
    const { legacy, current } = await compare([
      replayAddress,
      replayIncident,
      replayAnswer,
      replayPosition,
      replayProfile,
      replayGps,
      replayAddressbot,
    ])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([
      KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
      KEY.ALARM_INCIDENT_STATE_CHANGED,
      KEY.ALARM_CALL_ANSWER_STATUS_CHANGED,
      KEY.MAP_LOCATE_CALL,
      KEY.ALARM_PROFILE_SYNC,
      KEY.TRACKING_VEHICLE_GPS_UPDATE,
      KEY.ADDRESS_ROBOT_GIS_SEARCH,
    ])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it.each(replayFamilies)(
    'Given $name 与 T1 同帧 When 从 WS 回放 Then 专属事件命中后停止 T1',
    async ({ frame, eventKey }) => {
      const { legacy, current } = await compare([{ ...frame, payload: replayProfile.payload }])
      expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([eventKey])
      expect(current.deliveries).toEqual(legacy.deliveries)
    },
  )

  it.each(
    replayFamilies.flatMap((family) =>
      replayWrappers.map((wrapper) => ({
        name: `${family.name}/${wrapper}`,
        frame: { [wrapper]: [family.frame] },
        original: family.frame,
        eventKey: family.eventKey,
        legacySupportsWrapper:
          family.eventKey === KEY.ALARM_CALL_ANSWER_STATUS_CHANGED ||
          family.eventKey === KEY.ALARM_INCIDENT_STATE_CHANGED ||
          (wrapper === 'userMsgBodyList' &&
            (family.eventKey === KEY.MAP_LOCATE_CALL || family.eventKey === KEY.TRACKING_VEHICLE_GPS_UPDATE)),
      })),
    ),
  )(
    'Given $name 外包列表 When 从 WS 回放 Then 旧支持时等价且已批准扩展严格对照旧原始帧',
    async ({ frame, original, eventKey, legacySupportsWrapper }) => {
      const { legacy, current } = await compare([frame])
      if (legacySupportsWrapper) {
        expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([eventKey])
        expect(current.deliveries).toEqual(legacy.deliveries)
      } else {
        expect(legacy.deliveries).toEqual([])
        const unwrapped = await replay('916', [original])
        expect(unwrapped.deliveries.map((item) => item.eventKey)).toEqual([eventKey])
        expect(current.deliveries).toEqual(unwrapped.deliveries)
      }
    },
  )

  it('Given content 定位和 customContent 应答同帧 When 从 WS 回放 Then 保持 916 position 优先级', async () => {
    const { legacy, current } = await compare([{ ...replayPosition, ...replayAnswer }])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.MAP_LOCATE_CALL])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it('Given content GPS 和 customContent 应答同帧 When 从 WS 回放 Then 保持 916 GPS 优先级', async () => {
    const { legacy, current } = await compare([{ content: replayGps, ...replayAnswer }])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.TRACKING_VEHICLE_GPS_UPDATE])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it.each([
    {
      name: 'userMsgBodyList 的 F1-F7',
      frame: { userMsgBodyList: replayFamilies.map((item) => item.frame) },
      eventKey: KEY.MAP_LOCATE_CALL,
    },
    {
      name: '包装 addressbot 与原生 answer',
      frame: { ...replayAnswer, body: replayAddressbot },
      eventKey: KEY.ALARM_CALL_ANSWER_STATUS_CHANGED,
    },
    {
      name: '包装 position 与原生 GPS',
      frame: { ...replayGps, body: replayPosition },
      eventKey: KEY.TRACKING_VEHICLE_GPS_UPDATE,
    },
    {
      name: '包装 position 与原生 answer',
      frame: { ...replayAnswer, body: replayPosition },
      eventKey: KEY.ALARM_CALL_ANSWER_STATUS_CHANGED,
    },
    {
      name: '包装 GPS 与原生 incident',
      frame: { ...replayIncident, body: replayGps },
      eventKey: KEY.ALARM_INCIDENT_STATE_CHANGED,
    },
  ])('Given $name 混合整帧 When 从 WS 回放 Then 包装增强不覆盖 916 原生结果', async ({ frame, eventKey }) => {
    const { legacy, current } = await compare([frame])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([eventKey])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it('Given SEAT 多定位和重复投递且附带 GPS/T1 When 从 WS 回放 Then 扇出后停止外围双分发', async () => {
    const { legacy, current } = await compare([
      {
        topics: [{ type: 'SEAT', key: '8001' }],
        userMsgBodyList: [
          replayPosition,
          replayPosition,
          {
            content: { ...replayPosition.content, eventid: 'call-2', lng: '114.1' },
          },
          replayGps,
        ],
        payload: replayProfile.payload,
      },
    ])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.MAP_LOCATE_CALL, KEY.MAP_LOCATE_CALL])
    expect(legacy.deliveries.map((item) => item.data)).toMatchObject([{ id: 'call-1' }, { id: 'call-2' }])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it.each([
    { name: 'notifyType', badFrame: { notifyType: { toString: null } } },
    { name: 'notifySubType', badFrame: { notifySubType: { toString: null } } },
    { name: 'topic key', badFrame: { topics: [{ type: 'CUSTOM', key: { toString: null } }] } },
  ])('Given 席位批中 $name 坏帧 When 两侧从 WS 回放 Then 合法定位仍按顺序扇出', async ({ badFrame }) => {
    const { legacy, current } = await compare([
      {
        topics: [{ type: 'SEAT', key: '8001' }],
        userMsgBodyList: [
          badFrame,
          replayPosition,
          badFrame,
          {
            content: { ...replayPosition.content, eventid: 'call-2', lng: '114.1' },
          },
        ],
      },
    ])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.MAP_LOCATE_CALL, KEY.MAP_LOCATE_CALL])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it('Given 916 不支持的坏 notifyTypeDto When 新链逐帧容错 Then 保留其余定位并显式记录容错增强', async () => {
    const frame = {
      userMsgBodyList: [{ notifyTypeDto: { notifyType: { toString: null } } }, replayPosition],
    }
    await expect(replay('916', [frame])).rejects.toThrow(TypeError)
    const legacy = await replay('916', [replayPosition])
    const current = await replay('current', [frame])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.MAP_LOCATE_CALL])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it('Given SEAT 多批 GPS 和无效重复点 When 从 WS 回放 Then 保持点过滤和批次顺序且只分发一次', async () => {
    const point = replayGps.datas[0]
    const { legacy, current } = await compare([
      {
        topics: [{ type: 'SEAT', key: '8001' }],
        userMsgBodyList: [
          { content: { datas: [point, point, null, { ...point, latitude: 91 }] } },
          { content: { datas: [point, { ...point, carId: 'car-2', longitude: '114.1' }] } },
        ],
        payload: replayProfile.payload,
      },
    ])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([
      KEY.TRACKING_VEHICLE_GPS_UPDATE,
      KEY.TRACKING_VEHICLE_GPS_UPDATE,
    ])
    expect(legacy.deliveries.map((item) => item.data)).toMatchObject([
      { datas: [{ carId: 'car-1' }] },
      { datas: [{ carId: 'car-2' }] },
    ])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it('Given SEAT 包含两条 answer When 从 WS 回放 Then 两侧均只分发首个匹配载荷', async () => {
    const { legacy, current } = await compare([
      {
        topics: [{ type: 'SEAT', key: '8001' }],
        userMsgBodyList: [
          replayAnswer,
          {
            customContent: {
              ...replayAnswer.customContent,
              eventId: 'answer-2',
              data: { ...replayAnswer.customContent.data, callId: 'call-2' },
            },
          },
        ],
      },
    ])
    expect(legacy.deliveries).toHaveLength(1)
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it('Given SEAT 包含两条 incident When 从 WS 回放 Then 两侧均只分发首个匹配载荷', async () => {
    const { legacy, current } = await compare([
      {
        topics: [{ type: 'SEAT', key: '8001' }],
        userMsgBodyList: [
          replayIncident,
          {
            customContent: {
              ...replayIncident.customContent,
              eventId: 'incident-event-2',
              data: { ...replayIncident.customContent.data, incidentId: 'incident-2' },
            },
          },
        ],
      },
    ])
    expect(legacy.deliveries).toHaveLength(1)
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it('Given 外层 ALARM_CALL 路由和记录号 When 深层 answer 无 eventName Then 两侧继承路由且载荷一致', async () => {
    const { legacy, current } = await compare([
      {
        id: 'outer-record',
        topics: [{ type: 'CUSTOM', customType: 'ALARM_CALL', key: 'ANSWER_STATUS_CHANGED' }],
        meta: { traceId: 'trace-1' },
        request: {
          channel: 'WEBSOCKET',
          body: { payload: { customContent: { data: replayAnswer.customContent.data } } },
        },
      },
    ])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.ALARM_CALL_ANSWER_STATUS_CHANGED])
    expect(current.deliveries).toEqual(legacy.deliveries)
    expect(legacy.envelopes[0]?.meta).toMatchObject({ recordId: 'outer-record' })
    expect(current.envelopes[0]?.meta).toMatchObject({
      recordId: 'outer-record',
      traceId: 'trace-1',
      channel: 'WEBSOCKET',
    })
  })

  it('Given ALARM_CALL 的合法 answer 同含 incidentId When 从 WS 回放 Then 两侧均优先应答事件', async () => {
    const { legacy, current } = await compare([
      {
        topics: [{ type: 'CUSTOM', customType: 'ALARM_CALL', key: 'ANSWER_STATUS_CHANGED' }],
        ...replayAnswer,
      },
    ])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.ALARM_CALL_ANSWER_STATUS_CHANGED])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it.each([
    { name: '位置与应答', frames: [replayPosition, replayAnswer] },
    { name: 'GPS 与应答', frames: [replayGps, replayAnswer] },
    { name: '地址机器人、位置、GPS 与应答', frames: [replayAddressbot, replayPosition, replayGps, replayAnswer] },
  ])('Given 顶层 $name 列表 When 从 WS 回放 Then 比较两侧实际优先级与载荷', async ({ frames }) => {
    const { legacy, current } = await compare([frames])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.ALARM_CALL_ANSWER_STATUS_CHANGED])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it('Given 顶层位置/GPS 与 incident 列表 When 从 WS 回放 Then 不截走 916 已识别的 incident', async () => {
    const { legacy, current } = await compare([[replayPosition, replayGps, replayIncident]])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.ALARM_INCIDENT_STATE_CHANGED])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it('Given ALARM_CALL 显式路由但载荷是 incident When 从 WS 回放 Then 记录已批准的路由拦截修正', async () => {
    const { legacy, current } = await compare([
      {
        topics: [{ type: 'CUSTOM', customType: 'ALARM_CALL', key: 'ANSWER_STATUS_CHANGED' }],
        ...replayIncident,
      },
    ])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.ALARM_INCIDENT_STATE_CHANGED])
    expect(current.deliveries).toEqual([])
  })

  it.each([
    {
      name: '根 eventType/data',
      frame: { eventType: KEY.ALARM_PROFILE_SYNC, data: { incidentId: 'i1', longitude: null } },
    },
    { name: 'payload eventType/data', frame: replayProfile },
    { name: 'payload eventKey/data', frame: { payload: { eventKey: KEY.ALARM_PROFILE_SYNC, data: null } } },
    { name: '根 eventType 空载荷', frame: { eventType: KEY.ALARM_PROFILE_SYNC, data: null } },
    { name: 'F4 移除来电定位', frame: { payload: { eventType: KEY.MAP_LOCATE_CALL_REMOVE, data: { id: 'call-1' } } } },
  ])('Given 仅 T1 $name When 专属链无命中 Then 实际事件和空值载荷保持一致', async ({ frame }) => {
    const { legacy, current } = await compare([frame])
    expect(legacy.deliveries).toHaveLength(1)
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it('Given T1 payload 列表 When 专属链无命中 Then 两侧均忽略且不展开多分发', async () => {
    const { legacy, current } = await compare([
      { payload: [replayProfile.payload, { eventType: KEY.MAP_LOCATE_CALL_REMOVE, data: { id: 'call-1' } }] },
    ])
    expect(legacy.deliveries).toEqual([])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it.each([
    { name: '根 eventKey 无 eventType', frame: { eventKey: KEY.ALARM_PROFILE_SYNC, data: null } },
    { name: 'request 中的 T1', frame: { request: replayProfile } },
    { name: '顶层 T1 列表', frame: [replayProfile] },
    { name: 'false payload', frame: { eventType: KEY.ALARM_PROFILE_SYNC, payload: false, data: null } },
    { name: '零 payload', frame: { eventType: KEY.ALARM_PROFILE_SYNC, payload: 0, data: null } },
    { name: '空串 payload', frame: { eventType: KEY.ALARM_PROFILE_SYNC, payload: '', data: null } },
    {
      name: '空 eventType 不回退 eventKey',
      frame: { payload: { eventType: '', eventKey: KEY.MAP_READY, data: null } },
    },
  ])('Given T1 边界 $name When 从 WS 回放 Then 不扩展旧未支持的输入', async ({ frame }) => {
    const { legacy, current } = await compare([frame])
    expect(legacy.deliveries).toEqual([])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it.each([
    { name: 'undefined data', frame: { payload: { eventType: KEY.ALARM_PROFILE_SYNC } } },
    { name: 'null payload 回退根 eventType', frame: { eventType: KEY.ALARM_PROFILE_SYNC, payload: null, data: null } },
    {
      name: '空对象 payload 优先于根 eventType',
      frame: { eventType: KEY.ALARM_PROFILE_SYNC, payload: {}, data: null },
    },
  ])('Given T1 空值 $name When 从 WS 回放 Then 保留旧 payload 边界和载荷', async ({ frame }) => {
    const { legacy, current } = await compare([frame])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it.each([
    { name: 'position', data: replayPosition },
    { name: 'GPS', data: replayGps },
  ])('Given T1 payload 的 data 像 $name When 从 WS 回放 Then 业务归一不应抢走旧 T1 载荷', async ({ data }) => {
    const { legacy, current } = await compare([{ payload: { eventType: KEY.ALARM_PROFILE_SYNC, data } }])
    expect(legacy.deliveries.map((item) => item.eventKey)).toEqual([KEY.ALARM_PROFILE_SYNC])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it.each([
    { name: 'null', frame: null },
    { name: 'undefined', frame: undefined },
    { name: '空对象', frame: {} },
    { name: '空列表', frame: [] },
    { name: '空字符串', frame: '' },
    { name: 'pong', frame: 'pong' },
    { name: '非 JSON 字符串', frame: '{invalid' },
    { name: 'false', frame: false },
    { name: '零', frame: 0 },
    { name: '空 payload', frame: { payload: null } },
    { name: '空 userMsgBodyList', frame: { userMsgBodyList: [] } },
    { name: 'GPS 空 datas', frame: { datas: [] } },
    { name: 'GPS 无效坐标', frame: { datas: [{ ...replayGps.datas[0], longitude: 'invalid' }] } },
    { name: '空 callId', frame: { customContent: { ...replayAnswer.customContent, data: { callId: '' } } } },
  ])('Given $name 输入 When 从 WS 回放 Then 两侧均不产生事件', async ({ frame }) => {
    const { legacy, current } = await compare([frame])
    expect(legacy.deliveries).toEqual([])
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it.each([
    {
      name: 'F3 newState/channel 空值',
      frame: {
        customContent: {
          ...replayAnswer.customContent,
          data: { callId: 'call-1', newState: null, answered: false, ended: true, channel: null },
        },
      },
    },
    {
      name: 'F4 零坐标和空地址',
      frame: {
        content: { ...replayPosition.content, lng: '0', lat: 0, address: '', Carrier_Loc: '' },
      },
    },
    { name: 'F6 零坐标与缺省可选字段', frame: { datas: [{ carId: 'car-1', longitude: 0, latitude: '0' }] } },
    {
      name: 'F6 null/空串坐标的既有 Number 转换',
      frame: { datas: [{ carId: 'car-1', longitude: null, latitude: '' }] },
    },
    {
      name: 'F1 全量清空',
      frame: {
        ...replayAddress,
        customContent: {
          incidentId: 'incident-1',
          version: 4,
          slots: [
            { slotCode: 'longitude', filledValue: null },
            { slotCode: 'latitude', filledValue: '' },
            { slotCode: 'disaster_address', filledValue: null },
            { slotCode: 'm_org_id', filledValue: null },
          ],
        },
      },
    },
    {
      name: 'F1 缺席 afterValue 回退 beforeValue',
      frame: {
        ...replayAddress,
        customContent: {
          incidentId: 'incident-1',
          version: 4,
          slotChanges: [{ slotCode: 'longitude', beforeValue: '113.8' }],
        },
      },
    },
    {
      name: 'F6 CloudEvent',
      frame: { source: 'ids:carlocation', type: 'ids:carlocation:location-sync', data: replayGps },
    },
    { name: 'F4 重复 JSON content', frame: { content: JSON.stringify(JSON.stringify(replayPosition.content)) } },
    { name: 'F6 重复 JSON content', frame: { content: JSON.stringify(JSON.stringify(replayGps)) } },
  ])('Given $name When 从 WS 回放 Then 真实事件与载荷兼容一致', async ({ frame }) => {
    const { legacy, current } = await compare([frame])
    expect(legacy.deliveries).toHaveLength(1)
    expect(current.deliveries).toEqual(legacy.deliveries)
  })

  it('Given F1 明确 null 清空修正 When 两侧回放 Then 记录旧值回退与新清空的已批准差异', async () => {
    const { legacy, current } = await compare([
      {
        ...replayAddress,
        customContent: {
          incidentId: 'incident-1',
          version: 4,
          slotChanges: [{ slotCode: 'longitude', beforeValue: '113.8', afterValue: null }],
        },
      },
    ])
    const before = legacy.deliveries[0]?.data as AddressUpdatedData
    const after = current.deliveries[0]?.data as AddressUpdatedData
    expect(before).toMatchObject({ longitude: 113.8, slots: { longitude: '113.8' } })
    expect(after).toMatchObject({ longitude: null, slots: { longitude: null } })
    expect(current.deliveries).not.toEqual(legacy.deliveries)
  })

  it('Given F1 全量中的显式 null When 两侧回放 Then 记录旧 slots 残留与新一致清空的已批准差异', async () => {
    const { legacy, current } = await compare([
      {
        ...replayAddress,
        customContent: {
          incidentId: 'incident-1',
          version: 4,
          slots: [{ slotCode: 'longitude', filledValue: '113.9' }],
          slotChanges: [{ slotCode: 'longitude', afterValue: null }],
        },
      },
    ])
    expect(legacy.deliveries[0]?.data).toMatchObject({ longitude: null, slots: { longitude: '113.9' } })
    expect(current.deliveries[0]?.data).toMatchObject({ longitude: null, slots: { longitude: null } })
    expect(current.deliveries).not.toEqual(legacy.deliveries)
  })

  it('Given F1 仅地址增量 When 两侧回放 Then 记录旧忽略与新保留地址增量的已批准差异', async () => {
    const { legacy, current } = await compare([
      {
        ...replayAddress,
        customContent: {
          incidentId: 'incident-1',
          version: 4,
          slotChanges: [{ slotCode: 'disaster_address', afterValue: '新地址' }],
        },
      },
    ])
    expect(legacy.deliveries).toEqual([])
    expect(current.deliveries.map((item) => item.eventKey)).toEqual([KEY.DISASTER_PROFILE_ADDRESS_UPDATED])
    expect(current.deliveries[0]?.data).toMatchObject({ address: '新地址', slots: { disaster_address: '新地址' } })
    expect(current.envelopes[0]?.meta).toMatchObject({ snapshotKind: 'delta' })
  })
})
