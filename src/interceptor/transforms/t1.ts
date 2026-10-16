import type { MessageEventKey } from '@/const/const.message.type'
import type { MessageInterceptor, NormalizedMessage } from '../types'
import { getFrameMetadata, isPlainObject, normalize } from '../unwrap'

export const normalizeT1Frames = (frame: unknown): NormalizedMessage[] => {
  if (!isPlainObject(frame)) return []
  const payload = frame.payload ?? (frame.eventType ? frame : null)
  if (!isPlainObject(payload)) return []
  const eventKey = payload.eventType ?? payload.eventKey ?? ''
  if (typeof eventKey !== 'string' || !eventKey) return []
  return [
    {
      eventKey: eventKey as MessageEventKey,
      data: payload.data,
      meta: { ...getFrameMetadata(normalize(frame)!), ...getFrameMetadata(normalize(payload)!) },
    },
  ]
}

export const t1Interceptor: MessageInterceptor = {
  id: 'message:t1',
  priority: 900,
  fallback: true,
  describe: 'T1 兼容兜底',
  subscribe: { type: 'RAW' },
  transform: (ctx) => {
    const results = normalizeT1Frames(ctx.raw)
    return { matched: results.length > 0, results, stop: true }
  },
}
