import type { GenericController } from '@/controller/core/generic'
import type { BusinessMapPort } from '@/controller/core/protocol/BusinessMapPort'
import { AreaFenceRenderer } from './AreaFenceRenderer'
import { AddressRobotRenderer } from './AddressRobotRenderer'

export const createBusinessMapPort = (generic: GenericController) => {
  const addressRobot = new AddressRobotRenderer(generic)
  const areaFence = new AreaFenceRenderer(generic)
  const port: BusinessMapPort = {
    ready: true,
    view: generic.view,
    geometry: generic.geometry,
    spatial: generic.spatial,
    kinematic: generic.kinematic,
    trackingVehicleGpsUpdate() {},
    addressRobotGisSearch: (data, options) => addressRobot.addressRobotGisSearch(data, options),
    addressRobotClear: (options) => addressRobot.addressRobotClear(options),
    areaFenceHighlight: (data, options) => areaFence.areaFenceHighlight(data, options),
    areaFenceClear: (data) => areaFence.areaFenceClear(data),
  }
  return {
    port,
    dispose: () => {
      areaFence.dispose()
      addressRobot.dispose()
    },
  }
}
