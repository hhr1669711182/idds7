import type { MessageInterceptor, NormalizedMessage } from '../types'
import { isPlainObject, normalize, unwrapMessageFrames } from '../unwrap'
import { matchesMessageRoute } from '../matcher'
import { addressRobotDispatcher } from './dispatchers/addressRobot'

export const normalizeAddressRobotFrames = (frame: unknown, nativeOnly = false): NormalizedMessage[] => {
  if (nativeOnly && (!isPlainObject(frame) || frame.notifyType !== 'addressbot' || !isPlainObject(frame.customContent)))
    return []
  const root = nativeOnly ? normalize(frame) : null
  if (nativeOnly && !root) return []
  const results: NormalizedMessage[] = []
  const seen = new Set<object>()
  for (const body of nativeOnly ? [root!] : unwrapMessageFrames(frame)) {
    if (!matchesMessageRoute(body, { type: 'CUSTOM', customType: 'ADDRESSBOT' })) continue
    if (body.customContent && seen.has(body.customContent)) continue
    const messages = addressRobotDispatcher(body)
    if (!messages?.length) continue
    if (body.customContent) seen.add(body.customContent)
    results.push(...messages)
  }
  return results
}

export const addressRobotInterceptor: MessageInterceptor = {
  id: 'message:address-robot',
  priority: 100,
  describe: '地址机器人',
  subscribe: { type: 'RAW' },
  transform: (ctx) => {
    const results = normalizeAddressRobotFrames(ctx.raw)
    return { matched: results.length > 0, results, stop: true }
  },
}
