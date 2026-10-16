import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const Get = vi.fn()
const Post = vi.fn()

vi.mock('@/service/alova', () => ({
  alovaInstance: {
    Get: (...args: unknown[]) => Get(...args) as Promise<unknown>,
    Post: (...args: unknown[]) => Post(...args) as Promise<unknown>,
  },
}))

import {
  createCommandId,
  dispatchVehiclesBatch,
  listDispatchVehicles,
  validateDispatchRequest,
  type DispatchVehiclesRequest,
} from '@/service/methods/dispatchVehicles'
import { useDispatchT1Store } from '@/store/useDispatchT1Store'

/**
 * 调派车辆契约（Dispatch1）：
 * - 列表接口路径以警情 ID 为参数，主管队站 ID 只用于适配层回填、不上送；
 * - 批量调派必须回显 commandId / incidentId 且车辆数一致，否则视为未确认（防重复提交）；
 * - 请求体必须含 1—200 个不重复的 vehicleId；
 * - 同一批车辆不能被下发两次（beginDispatch 幂等）。
 */
describe('service/methods/dispatchVehicles 调派车辆契约', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Get.mockReset()
    Post.mockReset()
  })

  describe('listDispatchVehicles', () => {
    it('警情 ID 为空直接拒绝，不发请求', async () => {
      await expect(listDispatchVehicles('', 'S1')).rejects.toThrow(/警情 ID/)
      await expect(listDispatchVehicles('I1', '')).rejects.toThrow(/主管队站 ID/)
      expect(Get).not.toHaveBeenCalled()
    })

    it('路径以警情 ID 拼接，主管队站 ID 不进 URL', async () => {
      Get.mockResolvedValue({ list: [], total: 0, pageNum: 1, pageSize: 20 })
      await listDispatchVehicles('I1', 'S1')
      expect(Get).toHaveBeenCalledWith(
        '/bff-client/api/v1/gis/incidents/I1/vehicles',
        expect.objectContaining({ cacheFor: 0 }),
      )
      const [url] = Get.mock.calls[0]
      expect(url).not.toContain('S1')
    })
  })

  describe('validateDispatchRequest', () => {
    const base: DispatchVehiclesRequest = {
      incidentId: 'I1',
      commandId: 'cmd-1',
      formationId: 'F1',
      formationVersion: 1,
      vehicles: [{ vehicleId: 'V1' }],
    }

    it('缺 incidentId / commandId / formationId 均拒绝', () => {
      expect(() => validateDispatchRequest({ ...base, incidentId: '' })).toThrow(/incidentId/)
      expect(() => validateDispatchRequest({ ...base, commandId: '  ' })).toThrow(/commandId/)
      expect(() => validateDispatchRequest({ ...base, formationId: '' })).toThrow(/formationId/)
    })

    it('formationVersion 必须是非负整数', () => {
      expect(() => validateDispatchRequest({ ...base, formationVersion: -1 })).toThrow(/formationVersion/)
      expect(() => validateDispatchRequest({ ...base, formationVersion: 1.5 })).toThrow(/formationVersion/)
    })

    it('车辆必须 1—200 个、vehicleId 有效且不重复', () => {
      expect(() => validateDispatchRequest({ ...base, vehicles: [] })).toThrow(/1—200/)
      expect(() => validateDispatchRequest({ ...base, vehicles: [{ vehicleId: '' }] })).toThrow(/1—200/)
      expect(() => validateDispatchRequest({ ...base, vehicles: [{ vehicleId: 'V1' }, { vehicleId: 'V1' }] })).toThrow(
        /1—200/,
      )
    })

    it('合法请求通过校验', () => {
      expect(() => validateDispatchRequest(base)).not.toThrow()
    })
  })

  describe('createCommandId', () => {
    it('生成非空且互不相同的幂等键', () => {
      const first = createCommandId()
      const second = createCommandId()
      expect(first).toBeTruthy()
      expect(first).not.toBe(second)
    })
  })

  describe('dispatchVehiclesBatch', () => {
    const request: DispatchVehiclesRequest = {
      incidentId: 'I1',
      commandId: 'cmd-1',
      formationId: 'F1',
      formationVersion: 1,
      vehicles: [{ vehicleId: 'V1' }, { vehicleId: 'V2' }],
    }

    it('incidentId 只走路径，body 只含 confirm 契约字段', async () => {
      Post.mockResolvedValue({
        commandId: 'cmd-1',
        incidentId: 'I1',
        batch: { batchId: 'B1', vehicleCount: 2 },
      })
      await dispatchVehiclesBatch(request)
      expect(Post).toHaveBeenCalledWith(
        '/bff-client/api/v1/dispatch/incidents/I1/confirm',
        { commandId: 'cmd-1', formationId: 'F1', formationVersion: 1, vehicles: request.vehicles },
        expect.objectContaining({ cacheFor: 0 }),
      )
      const [, body] = Post.mock.calls[0]
      expect(body).not.toHaveProperty('incidentId')
    })

    it('回显 commandId 不一致 → 视为未确认，拒绝返回', async () => {
      Post.mockResolvedValue({
        commandId: 'cmd-OTHER',
        incidentId: 'I1',
        batch: { batchId: 'B1', vehicleCount: 2 },
      })
      await expect(dispatchVehiclesBatch(request)).rejects.toThrow(/未确认/)
    })

    it('车辆数与请求不一致 → 拒绝（防部分成功被当成成功）', async () => {
      Post.mockResolvedValue({
        commandId: 'cmd-1',
        incidentId: 'I1',
        batch: { batchId: 'B1', vehicleCount: 1 },
      })
      await expect(dispatchVehiclesBatch(request)).rejects.toThrow(/未确认/)
    })

    it('缺少 batch → 拒绝', async () => {
      Post.mockResolvedValue({ commandId: 'cmd-1', incidentId: 'I1' })
      await expect(dispatchVehiclesBatch(request)).rejects.toThrow(/未确认/)
    })
  })
})

/** 调派状态机：车辆选中 → 下发 → 完成，期间不可重复下发。 */
describe('store/useDispatchT1Store 调派状态机', () => {
  /** 播种：completeQuery 建站，setStationVehicles 注入「待命」状态车辆（selectVehicle 只允许待命车） */
  const seedStation = (store: ReturnType<typeof useDispatchT1Store>, vehicleIds: string[]) => {
    store.completeQuery({
      incident: { id: 'I1' },
      primaryStation: { id: 'S1', vehicles: [] },
      supportStations: [],
      searchRadiusMeters: 0,
    })
    store.setStationVehicles(
      'S1',
      vehicleIds.map((id) => ({
        id,
        plateNumber: id,
        status: 'DAILY_STANDBY',
        selected: false,
        dispatched: false,
      })) as never,
    )
  }

  beforeEach(() => setActivePinia(createPinia()))

  it('未选车辆时 beginDispatch 返回 null', () => {
    const store = useDispatchT1Store()
    seedStation(store, ['C1'])
    expect(store.beginDispatch()).toBeNull()
  })

  it('选中后可下发，且同一时刻只能下发一次', () => {
    const store = useDispatchT1Store()
    seedStation(store, ['C1'])
    expect(store.selectVehicle('S1', 'C1', true)).toBeTruthy()

    const command = store.beginDispatch()
    expect(command).toBeTruthy()
    // 下发中（dispatching）车辆 selected 已被清 → 再次下发返回 null
    expect(store.beginDispatch()).toBeNull()

    // 下发中不可取消选择
    expect(store.selectVehicle('S1', 'C1', false)).toBeNull()

    store.completeDispatch(command!, { planStatus: 'DISPATCHED' })
    expect(store.stations[0].vehicles[0].dispatched).toBe(true)
  })

  it('cancelDispatch 清空选择：下发中不生效，非下发中则清勾选并回到可重新下发', () => {
    const store = useDispatchT1Store()
    seedStation(store, ['C1'])
    store.selectVehicle('S1', 'C1', true)
    const command = store.beginDispatch()!
    expect(command).toBeTruthy()

    // status === 'dispatching' 时 cancelDispatch 直接 return（不清选择）
    store.cancelDispatch()
    expect(store.stations[0].vehicles[0].selected).toBe(true)
    expect(store.beginDispatch()).toBeNull()

    // 完成下发后车辆变 dispatched，不可再勾选
    store.completeDispatch(command, { planStatus: 'DISPATCHED' })
    expect(store.stations[0].vehicles[0].dispatched).toBe(true)
    expect(store.selectVehicle('S1', 'C1', true)).toBeNull()

    store.reset()
    expect(store.dispatchResult).toBeUndefined()
    expect(store.stations).toEqual([])
  })
})
