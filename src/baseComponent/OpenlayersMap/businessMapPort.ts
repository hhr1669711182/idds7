import type { GenericController } from '@/controller/core/generic'
import type { BusinessMapPort } from '@/controller/core/protocol/BusinessMapPort'
import type { TrackingVehicleGpsUpdateData } from '@/controller/core/protocol/BusinessProtocol'
import { CAR_ICON } from './style/icons'
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
    trackingVehicleGpsUpdate(data: TrackingVehicleGpsUpdateData) {
      const { geometry } = generic
      data.datas.forEach((car) => {
        geometry.addMarker({
          id: `vehicle-${car.carId}`,
          lngLat: [car.longitude, car.latitude],
          iconType: 'vehicle',
          iconParams: { src: CAR_ICON, rotation: 0 },
        })
      })
    },
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
