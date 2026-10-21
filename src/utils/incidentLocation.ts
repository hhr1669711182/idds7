import type {
  AddressUpdatedData,
  IncidentLocationSnapshotKind,
  IncidentLocationContext,
  IncidentLocationSharedState,
  IncidentProfileData,
  NormalizedIncidentLocation,
} from '@/controller/core/protocol/IncidentLocationProtocol'

export const LOCATION_RELEVANT_SLOT_CODES = ['longitude', 'latitude', 'm_org_id'] as const

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

const nullableString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const slotValue = (value: unknown): string | null => (value === null || value === undefined ? null : String(value))

export const deriveSlotSnapshot = (slots: Record<string, string | null>) => {
  const coordinate = (code: string) => {
    const raw = slots[code]
    if (raw == null || !raw.trim()) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
  }
  return {
    address: slots.disaster_address ?? null,
    longitude: coordinate('longitude'),
    latitude: coordinate('latitude'),
    primaryStationId: slots.m_org_id?.trim() || null,
  }
}

export const getAddressProfileKey = (
  data: Pick<AddressUpdatedData, 'incidentId' | 'disasterProfileId' | 'eventId'>,
): string => data.incidentId?.trim() || data.disasterProfileId?.trim() || data.eventId?.trim() || ''

export const normalizeIncidentLocationContent = (
  body: unknown,
  kind?: IncidentLocationSnapshotKind,
): NormalizedIncidentLocation | null => {
  const content = asRecord(body)
  if (!content) return null
  const version = content.version == null ? 0 : Number(content.version)
  if (!Number.isSafeInteger(version) || version < 0) return null
  const fullSlots = Array.isArray(content.slots) ? content.slots : null
  const changes = Array.isArray(content.slotChanges) ? content.slotChanges : null
  const normalizedSlots = asRecord(content.slots)
  if (!fullSlots && !changes && !normalizedSlots) return null
  const slots: Record<string, string | null> = {}
  if (fullSlots) {
    for (const entry of fullSlots) {
      const slot = asRecord(entry)
      const code = nullableString(slot?.slotCode)
      if (code) slots[code] = slotValue(slot?.filledValue)
    }
  } else if (normalizedSlots) {
    for (const [code, value] of Object.entries(normalizedSlots)) {
      if (code.trim()) slots[code.trim()] = slotValue(value)
    }
  }
  if (changes) {
    for (const entry of changes) {
      const change = asRecord(entry)
      const code = nullableString(change?.slotCode)
      if (!code || !change) continue
      if (change.afterValue === undefined && fullSlots) continue
      if (change.afterValue === undefined && change.beforeValue === undefined) continue
      slots[code] = slotValue(change.afterValue === undefined ? change.beforeValue : change.afterValue)
    }
  }
  const data: AddressUpdatedData = {
    eventId: nullableString(content.eventId) ?? undefined,
    occurredAt: nullableString(content.occurredAt),
    disasterProfileId: nullableString(content.disasterProfileId),
    incidentId: nullableString(content.incidentId),
    inquiryId: nullableString(content.inquiryId),
    version,
    slots,
    ...deriveSlotSnapshot(slots),
  }
  return { data, snapshotKind: kind ?? (fullSlots ? 'full' : 'delta') }
}

export const parseAddressUpdatedContent = (body: unknown): AddressUpdatedData | null =>
  normalizeIncidentLocationContent(body)?.data ?? null

export const toAddressUpdatedData = (data: IncidentProfileData): AddressUpdatedData | null =>
  normalizeIncidentLocationContent(data, 'full')?.data ?? null

export const readIncidentLocationContext = (
  state: IncidentLocationSharedState,
  stage: string | null = state.MapMode ?? null,
): IncidentLocationContext => ({
  incidentId: state.currentAlarm?.incidentId?.trim() || null,
  stage,
  sessionEpoch: state.sessionEpoch ?? 0,
  sessionKey: JSON.stringify([
    state.rawState?.auth?.sessionId,
    state.rawState?.user?.userId,
    state.rawState?.seat?.seatNumber,
  ]),
})

export const getIncidentLocationContextKey = (context: IncidentLocationContext): string =>
  JSON.stringify([context.sessionEpoch, context.sessionKey, context.stage, context.incidentId])
