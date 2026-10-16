import type { BusinessMapPort } from '../protocol/BusinessMapPort'
import type { AddressRobotGisSearchData } from '../protocol/BusinessProtocol'

export class AddressRobotController {
  constructor(private port: BusinessMapPort) {}

  public addressRobotGisSearch(data: AddressRobotGisSearchData, options?: { businessId?: string }) {
    return this.port.addressRobotGisSearch(data, options)
  }

  public addressRobotClear(options: { businessId?: string } = {}) {
    return this.port.addressRobotClear(options)
  }
}
