import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type OlMap from 'ol/Map'
import type { AmapRealtimeNav } from '@/baseComponent/amap/useAmapTools'

const harness = vi.hoisted(() => ({
  ingest: vi.fn(),
  send: vi.fn(),
  onAck: vi.fn(),
  drawEnd: null as ((event: unknown) => void) | null,
  confirm: vi.fn(),
}))
vi.mock('@/store', () => ({ useUserStore: vi.fn() }))
vi.mock('@/store/useMessageStore', () => ({ useMessageStore: () => ({ ingest: harness.ingest }) }))
vi.mock('@/store/useIncidentLocationStore', () => ({ useIncidentLocationStore: () => ({ versions: {} }) }))
vi.mock('@/composables/useGisPointSelection', () => ({
  getGisPointChannel: () => ({ send: harness.send, onAck: harness.onAck }),
}))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: harness.confirm, close: vi.fn() } }))
vi.mock('ol/interaction', () => ({
  Draw: class {
    on(_name: string, callback: (event: unknown) => void) {
      harness.drawEnd = callback
    }
  },
}))
vi.mock('ol/source/Vector', () => ({
  default: class {
    clear() {}
  },
}))
vi.mock('ol/layer/Vector', () => ({
  default: class {
    getSource() {
      return { clear() {} }
    }
  },
}))

import { createIncidentRelocate } from '@/baseComponent/OpenlayersMap/incidentRelocate'
import { MESSAGE_EVENT_KEY } from '@/const/const.message.type'

describe('F12 incidentRelocate 仅依赖迁位（回归 RESULT 后 stop 清 retry 的冻结行为）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    harness.send.mockReset()
    harness.ingest.mockReset()
    harness.onAck.mockReset()
    harness.confirm.mockResolvedValue(undefined)
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('Given 选点与 token When 确认后发送 RESULT Then 保留原点位/wire/定位事件和既有不重试行为', async () => {
    const map = {
      addLayer: vi.fn(),
      removeLayer: vi.fn(),
      addInteraction: vi.fn(),
      removeInteraction: vi.fn(),
      getView: () => ({ getProjection: () => 'EPSG:4326' }),
    }
    const nav = { reverseGeocode: vi.fn().mockResolvedValue('测试地址') }
    const relocate = createIncidentRelocate(map as unknown as OlMap, nav as unknown as AmapRealtimeNav)
    relocate.start('I1', { ownerId: 'owner', requestId: 'R1' })
    expect(harness.send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PICK_READY', incidentID: 'I1', ownerId: 'owner', requestId: 'R1' }),
    )
    harness.drawEnd?.({ feature: { getGeometry: () => ({ getFirstCoordinate: () => [116, 39] }) } })
    await vi.advanceTimersByTimeAsync(0)
    expect(harness.send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        v: 1,
        type: 'PICK_RESULT',
        source: 'gis',
        ownerId: 'owner',
        requestId: 'R1',
        incidentID: 'I1',
        pointInfo: { x: '116', y: '39', address: '测试地址' },
      }),
    )
    expect(harness.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
        data: expect.objectContaining({ incidentId: 'I1', longitude: 116, latitude: 39, version: 1 }),
      }),
      'broadcastChannel',
      'ids-seat-web',
      { source: 'incident-relocate' },
    )
    await vi.advanceTimersByTimeAsync(4500)
    expect(harness.send.mock.calls.filter(([message]) => message.type === 'PICK_RESULT')).toHaveLength(1)
    expect(map.removeInteraction).toHaveBeenCalled()
    relocate.dispose()
  })
})
