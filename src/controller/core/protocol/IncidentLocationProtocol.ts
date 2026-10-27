import type { MessageEnvelope } from '@/types/message'
import type { SharedState } from './SharedStateProtocol'

export type IncidentLocationSnapshotKind = 'full' | 'delta'

export interface AddressUpdatedData {
  eventId?: string
  occurredAt?: string | null
  disasterProfileId?: string | null
  incidentId?: string | null
  inquiryId?: string | null
  version: number
  address: string | null
  longitude: number | null
  latitude: number | null
  primaryStationId: string | null
  slots: Record<string, string | null>
}

export interface IncidentLocationContext {
  incidentId: string | null
  stage: string | null
  sessionEpoch: number
  sessionKey?: string
}

export interface IncidentLocationSharedState {
  rawState?: SharedState | null
  currentAlarm?: { incidentId?: string | null } | null
  MapMode?: string
  sharedStateRevision?: number
  sessionEpoch?: number
}

export interface IncidentProfileData {
  disasterProfileId?: string | null
  inquiryId?: string | null
  incidentId?: string | null
  version?: number
  slots?: { slotCode?: string; filledValue?: string | null }[]
}

export interface NormalizedIncidentLocation {
  data: AddressUpdatedData
  snapshotKind: IncidentLocationSnapshotKind
}

export type IncidentLocationAcceptance =
  | {
      accepted: true
      key: string
      version: number
      snapshot: AddressUpdatedData
      snapshotKind: IncidentLocationSnapshotKind
      coordinateChanged: boolean
      primaryStationChanged: boolean
      removed: boolean
    }
  | {
      accepted: false
      reason: 'invalid' | 'identity' | 'version' | 'session' | 'stage' | 'watermark' | 'terminal' | 'disposed'
    }

export interface IncidentLocationRenderingPort {
  onIncidentLocationAccepted?: (state: Extract<IncidentLocationAcceptance, { accepted: true }>) => void
}

export interface IncidentLocationReceiver {
  receive: (envelope: MessageEnvelope<AddressUpdatedData>) => IncidentLocationAcceptance
  onAddressUpdated: (envelope: MessageEnvelope<AddressUpdatedData>) => IncidentLocationAcceptance
  reset: () => void
  dispose: () => void
}
