export type { AddressUpdatedData } from './IncidentLocationProtocol'

export interface CarLocationPoint {
  carId: string
  orgId?: string
  orgName?: string
  latitude: number
  longitude: number
  plateNumber: string
  gpsTime?: string
}

export interface CarLocationBatch {
  datas: CarLocationPoint[]
}

export interface AlarmIncidentStateData {
  incidentId: string
  previousState?: string | null
  previousStateName?: string | null
  newState: string
  newStateName?: string
  inquiryIds?: string[]
  primaryIncidentId?: string
  changedAt?: string | null
  dataSource?: string
  sourceId?: string
  reconciliation?: boolean
  ext?: Record<string, unknown>
  [key: string]: unknown
}

export interface AlarmIncidentCustomContent {
  eventId?: string
  eventName: string
  source: string
  data: AlarmIncidentStateData
}

export interface AlarmCallAnswerStatusData {
  callId: string
  previousState?: string | null
  newState?: string | null
  answered?: boolean
  ended?: boolean
  changedAt?: string | null
  channel?: string | null
  [key: string]: unknown
}

export interface PositionPayload {
  taskType?: string
  time?: string
  eventid?: string
  eventId?: string
  lng?: number | string
  lat?: number | string
  tel?: string
  ostype?: string
  latLngType?: string
  address?: string
  Carrier_Loc?: string
  [key: string]: unknown
}

export interface SharedDispatchVehicleMock {
  vehicleId: string
  plateNo?: string
  vehicleTypeName?: string
  stationId?: string
  stationName?: string
}

export interface SharedDispatchVehiclesMock {
  updatedAt: number
  vehicles: SharedDispatchVehicleMock[]
}
