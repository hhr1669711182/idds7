import type { SeatDispatcher } from '../seat'
import { normalizePositionFrames } from '../position'

export const locateCallDispatcher: SeatDispatcher = (frame) => {
  const results = normalizePositionFrames(frame.raw)
  return results.length ? results : null
}
