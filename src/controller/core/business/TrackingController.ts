import type { BusinessMapPort } from '../protocol/BusinessMapPort'
import type { TrackingVehicleGpsUpdateData } from '../protocol/BusinessProtocol'

export class TrackingController {
  constructor(private port: BusinessMapPort) {}

  /**
   * [GC-03] 车辆实时 GPS 上图控制
   */
  public trackingVehicleGpsUpdate(data: TrackingVehicleGpsUpdateData) {
    return this.port.trackingVehicleGpsUpdate(data)
  }
}
