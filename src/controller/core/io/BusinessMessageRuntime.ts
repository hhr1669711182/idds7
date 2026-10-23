import { watch } from 'vue'
import type { Pinia } from 'pinia'
import { useMessageStore } from '@/store/useMessageStore'
import { useUserStore } from '@/store/useUserStore'
import { usePendingCallLocationStore } from '@/store/usePendingCallLocationStore'
import { usePendingDispatchAlarmStore, type PendingDispatchAlarmProfile } from '@/store/usePendingDispatchAlarmStore'
import { useIncidentLocationStore } from '@/store/useIncidentLocationStore'
import { createLogger } from '@/utils/logger'
import { BusinessController } from '../business'
import { InputController } from './InputController'
import type { BusinessMapPort, BusinessMapAttachment } from '../protocol/BusinessMapPort'
import type { TrackingVehicleGpsUpdateData, AddressRobotGisSearchData } from '../protocol/BusinessProtocol'
import { MESSAGE_EVENT_KEY, type MessageEventKey } from '@/const/const.message.type'

const logger = createLogger('BusinessMessageRuntime')
type Attachment = { port: BusinessMapPort; options: BusinessMapAttachment }
type MockJob = { eventKey: MessageEventKey; data: unknown; epoch: number; generation: number }

const emptyPort: BusinessMapPort = {
  ready: false,
  view: {
    locate() {},
    layerToggle() {},
    layerRefresh() {},
    simulateClick() {},
    overlay3D() {},
    fitBounds() {},
    poiLocation() {},
  },
  geometry: {
    addMarker() {},
    addText() {},
    drawPolygon() {},
    drawLine() {},
    drawRouteCandidates() {},
    setFeatureVisible() {},
    removeFeature() {},
    clearByBusinessId() {},
  },
  spatial: { esQuery: async () => null, calcBuffer: () => null, calcRoute: async () => [] },
  kinematic: { smoothMove() {}, appendTrack() {}, playTrack() {} },
  trackingVehicleGpsUpdate() {},
  addressRobotGisSearch() {},
  addressRobotClear() {},
  areaFenceHighlight() {},
  areaFenceClear() {},
}

const guardMethods = <Target extends object>(target: Target, valid: () => boolean): Target =>
  new Proxy(target, {
    get(object, property) {
      const value: unknown = Reflect.get(object, property)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => (valid() ? Reflect.apply(value, object, args) : undefined)
    },
  })

export class BusinessMessageRuntime {
  private active: Attachment | null = null
  private started = false
  private disposed = false
  private stops: Array<() => void> = []
  private jobs: MockJob[] = []
  private generation = 0
  private draining: object | null = null
  private executing: { job: MockJob; run: object } | null = null
  private tracker: ((data: TrackingVehicleGpsUpdateData) => void) | null = null
  private latestGps: TrackingVehicleGpsUpdateData | null = null
  private alarmProfileListener: ((profile: PendingDispatchAlarmProfile) => void) | null = null
  private latestAddress: { data: AddressRobotGisSearchData; options?: { businessId?: string } } | null = null
  private readonly user = useUserStore()
  public readonly port: BusinessMapPort
  public readonly business: BusinessController
  public readonly input: InputController

  constructor() {
    this.port = new Proxy(emptyPort, {
      get: (_target, property) => {
        if (property === 'trackingVehicleGpsUpdate')
          return (data: TrackingVehicleGpsUpdateData) => this.receiveTracking(data)
        if (property === 'addressRobotGisSearch')
          return (data: AddressRobotGisSearchData, options?: { businessId?: string }) => {
            this.latestAddress = { data, options }
            return this.active?.port.addressRobotGisSearch(data, options)
          }
        if (property === 'addressRobotClear')
          return (options?: { businessId?: string }) => {
            this.latestAddress = null
            this.active?.port.addressRobotClear(options)
          }
        const attachment = this.active
        const port = attachment?.port ?? emptyPort
        const epoch = this.user.sessionEpoch
        const incidentId = this.user.currentAlarm?.incidentId
        const valid = () =>
          !this.disposed &&
          this.active === attachment &&
          epoch === this.user.sessionEpoch &&
          incidentId === this.user.currentAlarm?.incidentId
        if (property === 'view' || property === 'geometry' || property === 'kinematic')
          return guardMethods(port[property], valid)
        if (property === 'spatial')
          return {
            calcBuffer: (data: Parameters<BusinessMapPort['spatial']['calcBuffer']>[0]) =>
              valid() ? port.spatial.calcBuffer(data) : null,
            esQuery: async (data: Parameters<BusinessMapPort['spatial']['esQuery']>[0]) => {
              if (!valid()) return null
              const result = await port.spatial.esQuery(data)
              return valid() ? result : null
            },
            calcRoute: async (data: Parameters<BusinessMapPort['spatial']['calcRoute']>[0]) => {
              if (!valid()) return []
              const result = await port.spatial.calcRoute(data)
              return valid() ? result : []
            },
          }
        return Reflect.get(port, property)
      },
    })
    this.business = new BusinessController(this.port)
    this.input = new InputController(this.port, this.business, (eventKey, data) => this.enqueueMock(eventKey, data))
  }

  public start() {
    if (this.started || this.disposed) return
    this.started = true
    const pendingAlarm = usePendingDispatchAlarmStore()
    const contextKey = JSON.stringify([this.user.userId, this.user.sessionId, this.user.seatNumber])
    if (pendingAlarm.profile && pendingAlarm.contextKey !== contextKey) pendingAlarm.consume()
    this.input.initSubscriptions()
    this.stops.push(
      watch(
        () => this.user.sessionEpoch,
        () => {
          this.invalidateMock()
          this.latestGps = null
          this.latestAddress = null
          this.alarmProfileListener = null
          this.active?.port.addressRobotClear()
          this.business.call.clearLocateCalls()
          this.business.alarm.reset()
          usePendingCallLocationStore().consume()
          pendingAlarm.consume()
          this.business.incidentLocation.reset()
        },
        { flush: 'sync' },
      ),
    )
  }

  public attachMap(port: BusinessMapPort, options: BusinessMapAttachment = {}) {
    if (this.disposed) return () => {}
    this.pauseMock()
    this.active?.options.mock?.clear()
    this.active?.options.dispose?.()
    const attachment: Attachment = { port, options }
    const valid = () => !this.disposed && this.active === attachment
    attachment.port = {
      ...port,
      view: guardMethods(port.view, valid),
      geometry: guardMethods(port.geometry, valid),
      kinematic: guardMethods(port.kinematic, valid),
      spatial: {
        calcBuffer: (data) => (valid() ? port.spatial.calcBuffer(data) : null),
        esQuery: async (data) => {
          if (!valid()) return null
          const result = await port.spatial.esQuery(data)
          return valid() ? result : null
        },
        calcRoute: async (data) => {
          if (!valid()) return []
          const routes = await port.spatial.calcRoute(data)
          return valid() ? routes : []
        },
      },
      addressRobotGisSearch: (data, searchOptions) =>
        valid() ? port.addressRobotGisSearch(data, searchOptions) : undefined,
      addressRobotClear: (clearOptions) => {
        if (valid()) port.addressRobotClear(clearOptions)
      },
    }
    this.active = attachment
    const call = usePendingCallLocationStore().getActive()
    const hasPreciseLocation = Object.values(useIncidentLocationStore().markers).some(
      (entry) => entry.coordinateSource === 'slotChanges',
    )
    if (call && !hasPreciseLocation) this.business.call.locateCall(call)
    if (this.latestAddress) {
      const { data, options: searchOptions } = this.latestAddress
      const result = searchOptions
        ? attachment.port.addressRobotGisSearch(data, searchOptions)
        : attachment.port.addressRobotGisSearch(data)
      Promise.resolve(result).catch((error) => logger.error('恢复地址机器人结果失败', error))
    }
    void this.drainMock()
    return () => {
      if (this.active !== attachment) return
      this.active = null
      this.pauseMock()
      options.mock?.clear()
      options.dispose?.()
    }
  }

  public attachTracking(handler: (data: TrackingVehicleGpsUpdateData) => void) {
    if (this.disposed) return () => {}
    this.tracker = handler
    if (this.latestGps) handler(this.latestGps)
    return () => {
      if (this.tracker === handler) this.tracker = null
    }
  }

  /**
   * 订阅警情画像。与 attachTracking 同构：注册时同步 hydrate 当前缓存，
   * 避免消息先于页面挂载到达导致丢失（原先靠 store→prop→watch 倒挂传递）。
   */
  public attachAlarmProfile(handler: (profile: PendingDispatchAlarmProfile) => void) {
    if (this.disposed) return () => {}
    const store = usePendingDispatchAlarmStore()
    if (store.profile) handler(store.profile)
    this.alarmProfileListener = handler
    const stop = watch(
      () => store.profile,
      (profile) => {
        if (this.disposed || !profile) return
        handler(profile)
      },
      { flush: 'sync' },
    )
    this.stops.push(stop)
    return () => {
      stop()
      if (this.alarmProfileListener === handler) this.alarmProfileListener = null
    }
  }

  private receiveTracking(data: TrackingVehicleGpsUpdateData) {
    const points = new Map((this.latestGps?.datas ?? []).map((point) => [point.carId || point.plateNumber, point]))
    data.datas.forEach((point) => points.set(point.carId || point.plateNumber, point))
    this.latestGps = { datas: [...points.values()] }
    this.tracker?.(data)
  }

  private invalidateMock() {
    this.generation += 1
    this.draining = null
    this.executing = null
    this.jobs = []
    this.active?.options.mock?.clear()
  }

  private pauseMock() {
    const executing = this.executing
    this.executing = null
    this.draining = null
    if (executing && executing.job.epoch === this.user.sessionEpoch && executing.job.generation === this.generation) {
      this.jobs.unshift(executing.job)
    }
  }

  private enqueueMock(eventKey: MessageEventKey, data: unknown) {
    if (this.disposed) return
    if (eventKey === MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_CLEAR) {
      this.invalidateMock()
      return
    }
    if (eventKey === MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_RENDER) this.invalidateMock()
    this.jobs.push({ eventKey, data, epoch: this.user.sessionEpoch, generation: this.generation })
    void this.drainMock()
  }

  private async drainMock() {
    if (this.draining || this.disposed) return
    const run = {}
    this.draining = run
    try {
      while (this.jobs.length && !this.disposed && this.draining === run) {
        const attachment = this.active
        const mock = attachment?.options.kind === 'dispatch' ? attachment.options.mock : undefined
        if (!mock) break
        const job = this.jobs.shift()!
        if (job.epoch !== this.user.sessionEpoch || job.generation !== this.generation) continue
        const executing = { job, run }
        this.executing = executing
        try {
          switch (job.eventKey) {
            case MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_RENDER:
              await mock.render()
              break
            case MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_DISASTER_SITE:
              await mock.disasterSite(job.data)
              break
            case MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_SIMULATE:
              await mock.simulate()
              break
            case MESSAGE_EVENT_KEY.MOCK_DISPATCH_VEHICLES:
              await mock.dispatchVehicles(job.data)
              break
          }
        } catch (error) {
          logger.error('模拟任务执行失败', error)
        } finally {
          if (this.executing === executing) this.executing = null
        }
        if (this.active !== attachment) break
      }
    } finally {
      if (this.draining === run) {
        this.draining = null
        if (this.jobs.length && this.active?.options.mock && !this.disposed) void this.drainMock()
      }
    }
  }

  public leaveDispatch() {
    this.prepareDispatchLeave()()
  }

  public prepareDispatchLeave(): () => void {
    const generation = this.generation
    const epoch = this.user.sessionEpoch
    const locations = useIncidentLocationStore()
    const revision = locations.contextRevision
    return () => {
      if (this.disposed || epoch !== this.user.sessionEpoch) return
      if (generation === this.generation) this.invalidateMock()
      if (revision === locations.contextRevision) this.business.incidentLocation.reset()
    }
  }

  public dispose() {
    if (this.disposed) return
    this.disposed = true
    this.invalidateMock()
    this.input.destroy()
    this.stops.splice(0).forEach((stop) => stop())
    this.active?.options.dispose?.()
    this.active = null
    this.tracker = null
    this.latestGps = null
    this.latestAddress = null
    this.business.incidentLocation.dispose()
  }
}

const runtimes = new WeakMap<ReturnType<typeof useMessageStore>, BusinessMessageRuntime>()
export const getBusinessMessageRuntime = (pinia?: Pinia) => {
  const store = useMessageStore(pinia)
  let runtime = runtimes.get(store)
  if (!runtime) {
    runtime = new BusinessMessageRuntime()
    runtimes.set(store, runtime)
  }
  return runtime
}
export const disposeBusinessMessageRuntime = (pinia?: Pinia) => {
  const store = useMessageStore(pinia)
  runtimes.get(store)?.dispose()
  runtimes.delete(store)
}
