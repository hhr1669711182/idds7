import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MESSAGE_EVENT_KEY as KEY } from '@/const/const.message.type'
import { installDefaultInterceptors, interceptorRegistry } from '@/interceptor'

vi.mock('@/store', () => ({ useUserStore: () => ({ seatNumber: '8001' }) }))

const position = {
  content: { taskType: 'weizhiwang', eventid: 'call-1', lng: '113.9', lat: '22.5', latLngType: 'GPS' },
}
const gps = { datas: [{ carId: 'car-1', plateNumber: '粤B1', longitude: '113.9', latitude: '22.5' }] }
const answer = {
  customContent: {
    eventId: 'answer-1',
    eventName: 'AlarmCallAnswerStatusChanged',
    source: 'call-client',
    data: { callId: 'call-1', incidentId: 'incident-1', answered: true, newState: 'ANSWERED' },
  },
}
const incident = {
  customContent: {
    eventId: 'incident-event-1',
    eventName: 'AlarmIncidentStateChangedEvent',
    source: 'ids-alarm-client',
    data: { incidentId: 'incident-1', newState: 'CREATED', ext: { longitude: 113.9, latitude: 22.5 } },
  },
}
const address = {
  notifyType: 'disaster_profile',
  notifySubType: 'updated',
  customContent: {
    incidentId: 'incident-1',
    version: 2,
    slotChanges: [{ slotCode: 'longitude', afterValue: '113.9' }],
  },
}
const addressbot = {
  notifyType: 'addressbot',
  customContent: { event_type: 'AddressLocationUpdated', raw_text: '地址' },
}
const families = [
  [addressbot, KEY.ADDRESS_ROBOT_GIS_SEARCH],
  [position, KEY.MAP_LOCATE_CALL],
  [gps, KEY.TRACKING_VEHICLE_GPS_UPDATE],
  [answer, KEY.ALARM_CALL_ANSWER_STATUS_CHANGED],
  [incident, KEY.ALARM_INCIDENT_STATE_CHANGED],
  [address, KEY.DISASTER_PROFILE_ADDRESS_UPDATED],
] as const
const wrappers = ['request', 'data', 'body', 'message', 'payload', 'userMsgBodyList'] as const
const run = (raw: unknown) => interceptorRegistry.run(raw, 'ws', 'ids-seat-web')

describe('Control 916 迁移归一回归：Given 固定输入 When 新链接收 Then 保留事件与载荷', () => {
  let uninstall: () => void
  beforeEach(() => {
    interceptorRegistry.clear()
    uninstall = installDefaultInterceptors()
  })
  afterEach(() => uninstall())

  it.each(wrappers)('Given %s 包装及列表 When 遍历 Then 六类消息均可归一', (wrapper) => {
    for (const [frame, eventKey] of families) {
      expect(run({ [wrapper]: [{ unrelated: true }, frame] }).map((item) => item.eventKey)).toEqual([eventKey])
    }
  })

  it.each(families.map(([, eventKey], index) => [index, index === 0 ? KEY.MAP_LOCATE_CALL : eventKey] as const))(
    'Given 从优先级 %s 开始的混合帧 When 归一 Then 仅命中 %s 且 T1 不兜底',
    (index, eventKey) => {
      const raw = {
        userMsgBodyList: families.slice(index).map(([frame]) => frame),
        payload: { eventType: KEY.MAP_READY, data: { t1: true } },
      }
      expect(run(raw).map((item) => item.eventKey)).toEqual([eventKey])
    },
  )

  it('Given 顶层列表和重复定位 When 归一 Then 按 callId 去重并扇出', () => {
    const second = { content: { ...position.content, eventid: 'call-2' } }
    const result = run([position, position, second])
    expect(result.map((item) => item.data)).toMatchObject([
      { id: 'call-1', longitude: 113.9, latitude: 22.5, radius: 500, Carrier_Loc: 'gps 定位' },
      { id: 'call-2' },
    ])
  })

  it('Given 外层路由和元数据 When 深层 answer 被接收 Then 继承记录号与路由', () => {
    const result = run({
      id: 'outer-record',
      topics: [{ type: 'CUSTOM', customType: 'ALARM_CALL', key: 'ANSWER_STATUS_CHANGED' }],
      meta: { traceId: 'trace-1' },
      request: { channel: 'WEBSOCKET' },
      body: { payload: [{ customContent: JSON.stringify(answer.customContent) }] },
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      eventKey: KEY.ALARM_CALL_ANSWER_STATUS_CHANGED,
      data: answer.customContent.data,
      meta: { recordId: 'outer-record', traceId: 'trace-1', channel: 'WEBSOCKET', eventId: 'answer-1' },
    })
  })

  it('Given 无 topics 的合法 custom data When 归一 Then 保留完整应答与警情字段', () => {
    expect(run({ customContent: { data: answer.customContent.data } })[0]?.data).toEqual(answer.customContent.data)
    expect(run({ customContent: { data: incident.customContent.data } })[0]?.data).toEqual(incident.customContent.data)
  })

  it.each([
    { topics: [{ type: 'CUSTOM', customType: 'ALARM_CALL', key: 'ANSWER_STATUS_CHANGED' }] },
    { notifyType: 'alarm_call', notifySubType: 'answer_status_changed' },
    { notifyTypeDto: { notifyType: 'alarm_call', notifySubType: 'answer_status_changed' } },
  ])('Given 显式 ALARM_CALL 且含 incidentId When 归一 Then 不被 incident shape 抢走 %j', (routing) => {
    expect(
      run({ ...routing, customContent: { data: answer.customContent.data } }).map((item) => item.eventKey),
    ).toEqual([KEY.ALARM_CALL_ANSWER_STATUS_CHANGED])
    expect(run({ ...routing, body: { customContent: { data: incident.customContent.data } } })).toEqual([])
  })

  it('Given 明确无关路由 When data 看似 GPS 或位置 Then 不按 shape 抢走', () => {
    expect(run({ notifyType: 'OTHER', content: gps })).toEqual([])
    expect(run({ notifyType: 'OTHER', ...position })).toEqual([])
    expect(
      run({ topics: [{ type: 'CUSTOM', customType: 'OTHER', key: 'UPDATED' }], customContent: address.customContent }),
    ).toEqual([])
  })

  it('Given SEAT multi 的两条定位 When 内部扇出 Then 外围不重复分发', () => {
    const result = run({
      topics: [{ type: 'SEAT', key: '8001' }],
      userMsgBodyList: [position, { content: { ...position.content, eventid: 'call-2' } }],
    })
    expect(result.map((item) => item.eventKey)).toEqual([KEY.MAP_LOCATE_CALL, KEY.MAP_LOCATE_CALL])
  })

  it('Given SEAT 同含显式错误路由 When 地址机器人 shape 命中 Then 不经旧 dispatcher 抢走', () => {
    expect(
      run({
        ...addressbot,
        topics: [
          { type: 'SEAT', key: '8001' },
          { type: 'CUSTOM', customType: 'OTHER', key: 'UPDATED' },
        ],
      }),
    ).toEqual([])
  })

  it('Given 路由 data 直接承载业务体 When 遍历父子节点 Then 不重复也不污染 payload', () => {
    const data = { callId: 'call-1', answered: true }
    expect(
      run({ notifyType: 'ALARM_CALL', notifySubType: 'ANSWER_STATUS_CHANGED', data }).map((item) => item.data),
    ).toEqual([data])
  })

  it('Given 裸 datas GPS 的坏点和重复点 When 接收 Then 校验范围并去重', () => {
    const point = gps.datas[0]
    expect(run({ datas: [point, point, { ...point, latitude: 91 }] })[0]?.data).toEqual({
      datas: [{ carId: 'car-1', plateNumber: '粤B1', longitude: 113.9, latitude: 22.5 }],
    })
  })

  it('Given slots 全量和 slotChanges 增量 When 接收 Then 标识 full/delta', () => {
    expect(run(address)[0]).toMatchObject({ meta: { snapshotKind: 'delta' }, data: { longitude: 113.9 } })
    expect(
      run({
        customContent: {
          incidentId: 'incident-1',
          slots: [{ slotCode: 'latitude', filledValue: '22.5' }],
        },
      })[0],
    ).toMatchObject({ meta: { snapshotKind: 'full' }, data: { latitude: 22.5, slots: { latitude: '22.5' } } })
  })

  it.each([
    { slotChanges: [{ slotCode: 'longitude', beforeValue: '113.8', afterValue: null }] },
    {
      slots: [{ slotCode: 'longitude', filledValue: '113.9' }],
      slotChanges: [{ slotCode: 'longitude', beforeValue: '113.8', afterValue: null }],
    },
  ])('Given 显式 afterValue null When 接收画像 Then 清空坐标和 slots 不回退旧值 %j', (content) => {
    const result = run({ ...address, customContent: { incidentId: 'incident-1', ...content } })
    expect(result).toHaveLength(1)
    expect(result[0]?.data).toMatchObject({ longitude: null, slots: { longitude: null } })
  })

  it('Given 仅地址增量 When 接收画像 Then 保留 delta 且不补入缺席坐标', () => {
    const result = run({
      ...address,
      customContent: {
        incidentId: 'incident-1',
        slotChanges: [{ slotCode: 'disaster_address', afterValue: '地址' }],
      },
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      meta: { snapshotKind: 'delta' },
      data: { address: '地址', slots: { disaster_address: '地址' } },
    })
    expect(result[0]).not.toHaveProperty('data.slots.longitude')
    expect(result[0]).not.toHaveProperty('data.slots.latitude')
  })

  it.each([-1, 1.5, 'bad', Number.MAX_SAFE_INTEGER + 1])(
    'Given 非法 version %s When 接收画像 Then 拒绝载荷',
    (version) => {
      expect(run({ ...address, customContent: { ...address.customContent, version } })).toEqual([])
    },
  )

  it('Given F1 已归一 slots 映射 When 接收画像 Then 复用同一服务返回载荷与快照类型', async () => {
    const { normalizeIncidentLocationContent } = await import('@/utils/incidentLocation')
    const content = { incidentId: ' incident-1 ', version: 3, slots: { longitude: null, disaster_address: '地址' } }
    const expected = normalizeIncidentLocationContent(content)
    expect(expected).not.toBeNull()
    expect(run({ ...address, customContent: content })).toMatchObject([
      { data: expected?.data, meta: { snapshotKind: expected?.snapshotKind } },
    ])
  })

  it.each([
    { kind: 'full', content: { slots: { longitude: '113.9' } }, wrapper: false },
    { kind: 'full', content: { slots: { longitude: '113.9' } }, wrapper: true },
    { kind: 'delta', content: { slots: [{ slotCode: 'longitude', filledValue: '113.9' }] }, wrapper: false },
    { kind: 'delta', content: { slots: [{ slotCode: 'longitude', filledValue: '113.9' }] }, wrapper: true },
  ] as const)(
    'Given 显式 $kind 与 slots When wrapper=$wrapper 接收画像 Then 显式类型优先于形状推导',
    ({ kind, content, wrapper }) => {
      const frame = { ...address, customContent: { incidentId: 'incident-1', version: 4, ...content } }
      const result = run(
        wrapper
          ? { meta: { snapshotKind: kind, traceId: 'snapshot-1' }, body: frame }
          : { ...frame, meta: { snapshotKind: kind, traceId: 'snapshot-1' } },
      )
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        data: { longitude: 113.9, slots: { longitude: '113.9' } },
        meta: { snapshotKind: kind, traceId: 'snapshot-1' },
      })
    },
  )

  it('Given 仅 T1 包装 When 专属归一无结果 Then 用 eventType/data 兜底', () => {
    expect(run({ payload: { eventType: KEY.MAP_READY, data: { ready: true } } })).toMatchObject([
      { eventKey: KEY.MAP_READY, data: { ready: true } },
    ])
  })

  it('Given 环状包装 When 遍历 Then 有限退出且有效兄弟节点正常处理', () => {
    const root: Record<string, unknown> = { payload: answer }
    root.request = root
    expect(run(root).map((item) => item.eventKey)).toEqual([KEY.ALARM_CALL_ANSWER_STATUS_CHANGED])
  })

  it('Given customContent 本体 When 根 eventName 与 shape 冲突 Then 按路由识别且继承事件号', () => {
    expect(run({ ...answer.customContent, data: incident.customContent.data })).toEqual([])
    expect(run(incident.customContent)[0]).toMatchObject({
      eventKey: KEY.ALARM_INCIDENT_STATE_CHANGED,
      meta: { eventId: 'incident-event-1', eventName: 'AlarmIncidentStateChangedEvent' },
    })
  })

  it('Given 双重 JSON content 和 JSON 包装 When 解包 Then 保留合法位置和 answer', () => {
    expect(run({ content: JSON.stringify(JSON.stringify(position.content)) })[0]?.eventKey).toBe(KEY.MAP_LOCATE_CALL)
    expect(run({ body: JSON.stringify({ payload: answer }) })[0]?.eventKey).toBe(KEY.ALARM_CALL_ANSWER_STATUS_CHANGED)
  })

  it('Given 旧 GPS 仅 key 主题 When 接收 Then 仍归一合法车辆', () => {
    expect(run({ topics: [{ type: 'CUSTOM', key: 'car-location-broadcast-all' }], content: gps })[0]?.eventKey).toBe(
      KEY.TRACKING_VEHICLE_GPS_UPDATE,
    )
  })

  it('Given 默认链 When 检查优先级 Then 专属优先级不同且均 stop', () => {
    const list = interceptorRegistry.list()
    expect(new Set(list.map((item) => item.priority)).size).toBe(list.length)
    for (const [frame] of families) expect(run(frame)).toHaveLength(1)
  })

  it('Given URL 和席位 When 构造订阅 Then 无 Control 依赖且维持 V2 单入口', async () => {
    const subscriptions = await import('@/interceptor/subscriptions')
    expect(subscriptions.buildMessageWebSocketUrl('https://host/message-client/')).toBe('wss://host/message-client/ws')
    expect(subscriptions.buildMessageWebSocketUrl('http://host/')).toBe('ws://host/message-client/ws')
    expect(subscriptions.buildMessageWebSocketUrl(' ')).toBe('')
    expect(subscriptions.buildPositionSubscription('8002')).toEqual({ action: 'subscribe', topic: 'seat/8002' })
    expect(subscriptions.CAR_LOCATION_SUBSCRIPTION.topic).toBe('GPS_MSG/car-location-broadcast-all')
    expect(subscriptions.ADDRESS_UPDATED_SUBSCRIPTION.topic).toBe('DISASTER_PROFILE/UPDATED')
    expect(subscriptions.ALARM_STATE_SUBSCRIPTION).toEqual({
      action: 'subscribe',
      topic: 'ALARM_INCIDENT/STATE_CHANGED',
    })
    expect(subscriptions.ALARM_CALL_SUBSCRIPTION).toEqual({
      action: 'subscribe',
      topic: 'ALARM_CALL/ANSWER_STATUS_CHANGED',
    })
  })

  it('Given register 使用约定导入路径 When 获取 helper Then 转导出同一纯函数及订阅', async () => {
    const expected = await import('@/interceptor/subscriptions')
    const actual = await import('@/register/messageSubscriptions')
    expect(actual.buildMessageWebSocketUrl).toBe(expected.buildMessageWebSocketUrl)
    expect(actual.buildPositionSubscription).toBe(expected.buildPositionSubscription)
    expect(actual.CAR_LOCATION_SUBSCRIPTION).toBe(expected.CAR_LOCATION_SUBSCRIPTION)
    expect(actual.ADDRESS_UPDATED_SUBSCRIPTION).toBe(expected.ADDRESS_UPDATED_SUBSCRIPTION)
  })
})
