import type { GenericController } from '@/controller/core/generic'
import type { BusinessMapPort } from '@/controller/core/protocol/BusinessMapPort'
import { AddressRobotRenderer } from './AddressRobotRenderer'

export const createBusinessMapPort = (generic: GenericController) => {
  const addressRobot = new AddressRobotRenderer(generic)
  const port: BusinessMapPort = {
    ready: true,
    view: generic.view,
    geometry: generic.geometry,
    spatial: generic.spatial,
    kinematic: generic.kinematic,
    trackingVehicleGpsUpdate() {},
    addressRobotGisSearch: (data, options) => addressRobot.addressRobotGisSearch(data, options),
    addressRobotClear: (options) => addressRobot.addressRobotClear(options),
  }
  return { port, dispose: () => addressRobot.dispose() }
}
