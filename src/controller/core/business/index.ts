import type { GenericController } from '../generic';
import { ConfigController } from './ConfigController';
import { AlarmController } from './AlarmController';
import { DutyController } from './DutyController';
import { CallController } from './CallController';
import { DispatchController } from './DispatchController';
import { TrackingController } from './TrackingController';

export class BusinessController {
  public config: ConfigController;
  public alarm: AlarmController;
  public duty: DutyController;
  public call: CallController;
  public dispatch: DispatchController;
  public tracking: TrackingController;

  constructor(private genericController: GenericController) {
    this.config = new ConfigController(this.genericController);
    this.alarm = new AlarmController(this.genericController);
    this.duty = new DutyController(this.genericController);
    this.call = new CallController(this.genericController);
    this.dispatch = new DispatchController(this.genericController);
    this.tracking = new TrackingController(this.genericController);
  }
}

export * from './ConfigController';
export * from './AlarmController';
export * from './DutyController';
export * from './CallController';
export * from './DispatchController';
export * from './TrackingController';