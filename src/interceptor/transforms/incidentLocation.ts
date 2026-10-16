import { MESSAGE_EVENT_KEY, MESSAGE_SUBSCRIBE_TOPIC } from '@/const/const.message.type'
import type { AddressUpdatedData } from '@/controller/core/protocol/LegacyMessageProtocol'
import { normalizeIncidentLocationContent } from '@/service/incidentLocation'
import type { MessageInterceptor, NormalizedMessage } from '../types'
import { matchesMessageRoute } from '../matcher'
import { getFrameMetadata, getMessagePayload, normalize, unwrapMessageFrames } from '../unwrap'

export { LOCATION_RELEVANT_SLOT_CODES, parseAddressUpdatedContent } from '@/service/incidentLocation'

export const normalizeAddressUpdatedFrames = (
  frame: unknown,
  nativeOnly = false,
): NormalizedMessage<AddressUpdatedData>[] => {
  const results: NormalizedMessage<AddressUpdatedData>[] = []
  const seen = new Set<object>()
  const root = nativeOnly ? normalize(frame) : null
  if (
    nativeOnly &&
    (!root ||
      !(
        root.topics.some(
          (topic) =>
            topic.type === 'CUSTOM' &&
            topic.customType === 'DISASTER_PROFILE' &&
            topic.key?.toUpperCase() === 'UPDATED',
        ) ||
        (String(root.raw.notifyType ?? '').toUpperCase() === 'DISASTER_PROFILE' &&
          String(root.raw.notifySubType ?? '').toUpperCase() === 'UPDATED')
      ))
  )
    return []
  for (const body of nativeOnly ? [root!] : unwrapMessageFrames(frame)) {
    if (!matchesMessageRoute(body, MESSAGE_SUBSCRIBE_TOPIC.DISASTER_PROFILE)) continue
    const content = getMessagePayload(body)
    if (seen.has(content)) continue
    const meta = getFrameMetadata(body)
    const kind = meta.snapshotKind === 'full' || meta.snapshotKind === 'delta' ? meta.snapshotKind : undefined
    const normalized = normalizeIncidentLocationContent(content, kind)
    if (!normalized) continue
    seen.add(content)
    results.push({
      eventKey: MESSAGE_EVENT_KEY.DISASTER_PROFILE_ADDRESS_UPDATED,
      data: normalized.data,
      meta: { ...meta, snapshotKind: normalized.snapshotKind },
    })
  }
  return results
}

export const normalizeAddressUpdatedFrame = (frame: unknown) => normalizeAddressUpdatedFrames(frame)[0] ?? null

export const incidentLocationInterceptor: MessageInterceptor = {
  id: 'topic:incident-location',
  priority: 150,
  describe: '画像地址变更',
  subscribe: MESSAGE_SUBSCRIBE_TOPIC.DISASTER_PROFILE,
  transform: (ctx) => {
    const results = normalizeAddressUpdatedFrames(ctx.raw)
    return { matched: results.length > 0, results, stop: true }
  },
}
