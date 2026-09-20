/*
 * @Author: hhr
 * @Date: 2026-07-08 14:35:45
 * @LastEditTime: 2026-09-18 10:05:21
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\controller\core\business\TrackingController.ts
 */
import type { GenericController } from '../generic';
import type { TrackingVehicleGpsUpdateData } from '../protocol';

export class TrackingController {
  constructor(private genericController: GenericController) {}

  /**
   * [GC-03] 车辆实时 GPS 上图控制
   * 编排：G-V02 layerToggle → IC-02 layerRefresh
   */
  public trackingVehicleGpsUpdate(data: TrackingVehicleGpsUpdateData) {
    const { view } = this.genericController;

    view.layerToggle({ layerId: data.layerId, visible: true });
    view.layerRefresh({ layerNames: [data.layerId], timestamp: Date.now() });
  }
}
