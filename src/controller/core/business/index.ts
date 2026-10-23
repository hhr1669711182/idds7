import type { BusinessMapPort } from '../protocol/BusinessMapPort'
import { ConfigController } from './ConfigController'
import { AlarmController } from './AlarmController'
import { DutyController } from './DutyController'
import { CallController } from './CallController'
import { DispatchController } from './DispatchController'
import { TrackingController } from './TrackingController'
import { AddressRobotController } from './AddressRobotController'
import { IncidentLocationController } from './IncidentLocationController'
import { AreaWeatherController } from './AreaWeatherController'

export class BusinessController {
  public config: ConfigController
  public alarm: AlarmController
  public duty: DutyController
  public call: CallController
  public dispatch: DispatchController
  public tracking: TrackingController
  public addressRobot: AddressRobotController
  public incidentLocation: IncidentLocationController
  public areaWeather: AreaWeatherController

  constructor(private genericController: BusinessMapPort) {
    this.config = new ConfigController(this.genericController)
    this.alarm = new AlarmController(this.genericController)
    this.duty = new DutyController(this.genericController)
    this.call = new CallController(this.genericController)
    this.dispatch = new DispatchController(this.genericController)
    this.tracking = new TrackingController(this.genericController)
    this.addressRobot = new AddressRobotController(this.genericController)
    this.incidentLocation = new IncidentLocationController()
    this.areaWeather = new AreaWeatherController(this.genericController)
  }
}

export * from './ConfigController'
export * from './AlarmController'
export * from './DutyController'
export * from './CallController'
export * from './DispatchController'
export * from './TrackingController'
export * from './AddressRobotController'
export * from './IncidentLocationController'
export * from './AreaWeatherController'
