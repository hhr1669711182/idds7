import { normalizeAddressRobotFrames } from './addressRobot'
import { normalizePositionFrames } from './position'
import { normalizeCarLocationFrames } from './carLocation'
import { normalizeAlarmCallFrames } from './alarmCall'
import { normalizeAlarmStateFrames } from './alarm'
import { normalizeAddressUpdatedFrames } from './incidentLocation'
import type { NormalizedMessage } from '../types'

export const normalizeBusinessFrames = (frame: unknown): NormalizedMessage[] => {
  const normalizers = [
    normalizeAddressRobotFrames,
    normalizePositionFrames,
    normalizeCarLocationFrames,
    normalizeAlarmCallFrames,
    normalizeAlarmStateFrames,
    normalizeAddressUpdatedFrames,
  ]
  for (const nativeOnly of [true, false]) {
    for (const normalizer of normalizers) {
      const results = normalizer(frame, nativeOnly)
      if (results.length) return results
    }
  }
  return []
}
