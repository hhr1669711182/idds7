import { watch } from 'vue'
import { useUserStore } from '@/store/useUserStore'
import { useMessageStore } from '@/store/useMessageStore'
import {
  MESSAGE_CHANNEL,
  MESSAGE_EVENT_KEY,
  MESSAGE_PROTOCOL_VERSION,
  MESSAGE_SYSTEM,
  MOCK_CALL_LOCATION_ID,
  type MessageEventKey,
} from '@/const/const.message.type'
import type { MessageEnvelope } from '@/types/message'

export type SharedDispatchVehicleMock = {
  vehicleId: string
  plateNo?: string
  vehicleTypeName?: string
  stationId?: string
  stationName?: string
}

export type SharedCallLocationMock = {
  updatedAt: number
  lng: number
  lat: number
  address?: string
}

export type SharedDispatchVehiclesMock = {
  updatedAt: number
  vehicles: SharedDispatchVehicleMock[]
}

export interface MockBridgeContext {
  sessionEpoch: number
  mockGeneration: number
}

export interface PendingSpecialMapRender extends MockBridgeContext {
  sharedStateRevision: number
  mockRevision: number
  updatedAt: number
}

export interface MockCallLocationBridgeState {
  rawState: unknown
  mode: unknown
  sharedStateRevision: number
  seatSharedStateMockRaw: string | null
  mockRevision: number
  sessionEpoch: number
}

export interface MockCallLocationBridgeOptions {
  userStore?: MockCallLocationBridgeState
  requestNavigation?: (request: PendingSpecialMapRender & { path: '/dispatch1' }) => void
}

export interface MockCallLocationBridge {
  dispose: () => void
  getContext: () => MockBridgeContext
  isCurrent: (context: MockBridgeContext | null | undefined) => boolean
  consumePendingSpecialMapRender: () => PendingSpecialMapRender | null
}

type MockSnapshot = {
  updatedAt: number
  call: Omit<SharedCallLocationMock, 'updatedAt'> | null
  vehicles: SharedDispatchVehicleMock[] | null
  site: unknown
  command: Record<string, unknown> | null
}

type MockEmissionContext = MockBridgeContext & {
  sharedStateRevision: number
  mockRevision: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const finiteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const isLoggedOut = (value: unknown): boolean => isRecord(value) && (value.auth === null || value.phase === 'loggedOut')

const commandId = (command: MockSnapshot['command']): string | number | null => {
  const id = command?.id
  if (typeof id === 'string') return id.trim() ? id : null
  return typeof id === 'number' && Number.isFinite(id) ? id : null
}

const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && (typeof value !== 'object' || Object.keys(value).length > 0)

const fingerprint = (value: unknown): string =>
  JSON.stringify(value ?? null, (_key, child: unknown) =>
    isRecord(child)
      ? Object.fromEntries(
          Object.keys(child)
            .sort()
            .map((key) => [key, child[key]]),
        )
      : child,
  )

const parseMock = (raw: string | null): MockSnapshot | null => {
  if (!raw) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!isRecord(value) || finiteNumber(value.v) !== 1) return null
    const updatedAt = finiteNumber(value.updatedAt)
    if (updatedAt === null) return null
    const location = isRecord(value.callLocation) ? value.callLocation : null
    const lng = finiteNumber(location?.lng)
    const lat = finiteNumber(location?.lat)
    const call =
      location && lng !== null && lat !== null
        ? { lng, lat, address: typeof location.address === 'string' ? location.address : '' }
        : null
    const vehicles = Array.isArray(value.dispatchVehicles)
      ? value.dispatchVehicles.flatMap((item: unknown): SharedDispatchVehicleMock[] => {
          if (!isRecord(item) || typeof item.vehicleId !== 'string' || !item.vehicleId.trim()) return []
          return [
            {
              vehicleId: item.vehicleId.trim(),
              plateNo: typeof item.plateNo === 'string' ? item.plateNo : undefined,
              vehicleTypeName: typeof item.vehicleTypeName === 'string' ? item.vehicleTypeName : undefined,
              stationId: typeof item.stationId === 'string' ? item.stationId.trim() : undefined,
              stationName: typeof item.stationName === 'string' ? item.stationName : undefined,
            },
          ]
        })
      : []
    const command =
      isRecord(value.flood) &&
      isRecord(value.flood.dispatchCommand) &&
      Object.keys(value.flood.dispatchCommand).length > 0
        ? value.flood.dispatchCommand
        : null
    return {
      updatedAt,
      call,
      vehicles: vehicles.length ? vehicles : null,
      site: hasValue(value.disasterSite) ? value.disasterSite : null,
      command,
    }
  } catch {
    return null
  }
}

let consumeActivePending: (() => PendingSpecialMapRender | null) | null = null

export const consumePendingSpecialMapRender = (): boolean => !!consumeActivePending?.()

export const createMockCallLocationBridge = (options: MockCallLocationBridgeOptions = {}): MockCallLocationBridge => {
  const state = options.userStore ?? useUserStore()
  const messages = useMessageStore()
  let disposed = false
  let generation = 0
  let sequence = 0
  let sessionEpoch = state.sessionEpoch
  let sharedRevision = state.sharedStateRevision
  let mockRevision = state.mockRevision
  let flood = false
  let loggedOut = isLoggedOut(state.rawState)
  let pending: PendingSpecialMapRender | null = null
  let runtimeContext: MockBridgeContext | null = null
  let mockRaw = state.seatSharedStateMockRaw
  let mockDeleted = mockRaw === null
  let snapshot = parseMock(mockRaw)
  const seenCommandIds = new Set<string | number>()
  let seen: Record<'call' | 'vehicles' | 'site' | 'command', string> = {
    call: fingerprint(snapshot?.call),
    vehicles: fingerprint(snapshot?.vehicles),
    site: fingerprint(snapshot?.site),
    command: fingerprint(snapshot?.command),
  }

  const getContext = (): MockBridgeContext => ({ sessionEpoch, mockGeneration: generation })
  const isCurrent = (context: MockBridgeContext | null | undefined): boolean =>
    !disposed &&
    !!context &&
    context.sessionEpoch === state.sessionEpoch &&
    context.sessionEpoch === sessionEpoch &&
    context.mockGeneration === generation

  const getEmissionContext = (): MockEmissionContext => ({
    ...getContext(),
    sharedStateRevision: sharedRevision,
    mockRevision,
  })
  const isCommitCurrent = (context: MockEmissionContext): boolean =>
    !disposed &&
    context.sessionEpoch === sessionEpoch &&
    context.sessionEpoch === state.sessionEpoch &&
    context.sharedStateRevision === sharedRevision &&
    context.sharedStateRevision === state.sharedStateRevision &&
    context.mockRevision === mockRevision &&
    context.mockRevision === state.mockRevision
  const isEmissionCurrent = (context: MockEmissionContext): boolean => isCurrent(context) && isCommitCurrent(context)

  const emit = (
    eventKey: MessageEventKey,
    data: unknown,
    source: string,
    context: MockEmissionContext,
    updatedAt?: number,
  ) => {
    if (!isEmissionCurrent(context)) return
    if (
      eventKey === MESSAGE_EVENT_KEY.MOCK_DISPATCH_VEHICLES ||
      eventKey === MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_RENDER ||
      eventKey === MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_DISASTER_SITE ||
      eventKey === MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_SIMULATE
    )
      runtimeContext = context
    const meta = {
      ...context,
      mock: true,
      source,
      ...(updatedAt !== undefined ? { mockUpdatedAt: updatedAt } : {}),
    }
    const envelope: MessageEnvelope<unknown> = {
      v: MESSAGE_PROTOCOL_VERSION,
      id: `mock-${context.sessionEpoch}-${context.mockGeneration}-${++sequence}-${Date.now()}`,
      timestamp: Date.now(),
      channel: MESSAGE_CHANNEL.LOCAL_STORAGE,
      system: MESSAGE_SYSTEM.IDS_SEAT_WEB,
      eventKey,
      data,
      meta,
    }
    messages.ingest(envelope, MESSAGE_CHANNEL.LOCAL_STORAGE, MESSAGE_SYSTEM.IDS_SEAT_WEB, meta)
  }

  const clearFlood = (source: string) => {
    pending = null
    const hadRuntimeContext = runtimeContext !== null
    runtimeContext = null
    generation += 1
    const wasFlood = flood
    flood = false
    if (wasFlood || hadRuntimeContext) emit(MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_CLEAR, {}, source, getEmissionContext())
  }

  const syncFlood = () => {
    const shared = state.rawState
    const updatedAt = isRecord(shared) ? finiteNumber(shared.updatedAt) : null
    const nextFlood =
      !loggedOut && state.mode === 'flood' && isRecord(shared) && finiteNumber(shared.v) === 1 && updatedAt !== null
    if (!nextFlood) {
      if (flood || (loggedOut && runtimeContext)) clearFlood('mock-special-map-exit')
      return
    }
    if (flood) return
    flood = true
    generation += 1
    pending = {
      ...getEmissionContext(),
      updatedAt,
    }
    const current = pending
    emit(MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_RENDER, null, 'seat-shared-state', current, current.updatedAt)
    if (flood && isEmissionCurrent(current)) options.requestNavigation?.({ ...current, path: '/dispatch1' })
  }

  const emitCall = (current: MockSnapshot, context: MockEmissionContext) => {
    if (loggedOut || !current.call) return
    emit(
      MESSAGE_EVENT_KEY.MAP_LOCATE_CALL,
      {
        id: MOCK_CALL_LOCATION_ID,
        longitude: current.call.lng,
        latitude: current.call.lat,
        radius: 500,
        Carrier_Loc: current.call.address || '',
      },
      'seat-shared-state-mock',
      context,
      current.updatedAt,
    )
  }

  const syncMock = (baseline = false) => {
    const context = getEmissionContext()
    const current = snapshot
    if (!isEmissionCurrent(context)) return
    if (mockRaw === null) {
      const alreadyDeleted = mockDeleted
      mockDeleted = true
      seen = { call: 'null', vehicles: 'null', site: 'null', command: 'null' }
      if (!baseline && !loggedOut && !alreadyDeleted)
        emit(MESSAGE_EVENT_KEY.MAP_LOCATE_CALL_REMOVE, { id: MOCK_CALL_LOCATION_ID }, 'seat-shared-state-mock', context)
      return
    }
    mockDeleted = false
    if (!current) return
    const next = {
      call: fingerprint(current.call),
      vehicles: fingerprint(current.vehicles),
      site: fingerprint(current.site),
      command: fingerprint(current.command),
    }
    const previous = seen
    seen = next
    const id = commandId(current.command)
    const commandChanged = id === null ? next.command !== previous.command : !seenCommandIds.has(id)
    if (id !== null) seenCommandIds.add(id)
    if (baseline || loggedOut) return
    if (next.call !== previous.call) emitCall(current, context)
    if (current.vehicles && next.vehicles !== previous.vehicles) {
      emit(
        MESSAGE_EVENT_KEY.MOCK_DISPATCH_VEHICLES,
        current.vehicles,
        'seat-shared-state-mock',
        context,
        current.updatedAt,
      )
    }
    if (flood && current.site !== null && next.site !== previous.site) {
      emit(
        MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_DISASTER_SITE,
        { disasterSite: current.site },
        'seat-shared-state-mock',
        context,
        current.updatedAt,
      )
    }
    if (flood && current.command && commandChanged) {
      emit(MESSAGE_EVENT_KEY.MOCK_SPECIAL_MAP_SIMULATE, null, 'seat-shared-state-mock', context, current.updatedAt)
    }
  }

  const consumePending = (): PendingSpecialMapRender | null => {
    const current = pending
    pending = null
    return current && flood && isCurrent(current) ? current : null
  }
  consumeActivePending = consumePending

  syncMock(true)

  const stopWatch = watch(
    () => [state.sharedStateRevision, state.mockRevision] as const,
    () => {
      if (disposed) return
      const mockChanged = mockRevision !== state.mockRevision
      const rawChanged = mockChanged && mockRaw !== state.seatSharedStateMockRaw
      if (rawChanged) {
        mockRaw = state.seatSharedStateMockRaw
        snapshot = parseMock(mockRaw)
      }
      const sharedChanged = sharedRevision !== state.sharedStateRevision
      const sessionChanged = sessionEpoch !== state.sessionEpoch
      mockRevision = state.mockRevision
      sharedRevision = state.sharedStateRevision
      sessionEpoch = state.sessionEpoch
      if (sharedChanged) loggedOut = isLoggedOut(state.rawState)
      const context = getEmissionContext()
      if (sessionChanged) {
        seenCommandIds.clear()
        syncMock(true)
        clearFlood('mock-session-changed')
      }
      if (!isCommitCurrent(context)) return
      if (sessionChanged || sharedChanged) syncFlood()
      if (rawChanged && !sessionChanged && isCommitCurrent(context)) syncMock()
    },
    { flush: 'sync' },
  )

  const startup = snapshot
  const startupContext = getEmissionContext()
  syncFlood()
  if (startup && isCommitCurrent(startupContext)) emitCall(startup, getEmissionContext())

  const dispose = () => {
    if (disposed) return
    stopWatch()
    clearFlood('mock-bridge-dispose')
    disposed = true
    if (consumeActivePending === consumePending) consumeActivePending = null
  }

  return { dispose, getContext, isCurrent, consumePendingSpecialMapRender: consumePending }
}
