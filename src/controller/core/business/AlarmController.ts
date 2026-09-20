/*
 * @Author: hhr
 * @Date: 2026-07-01 11:10:53
 * @LastEditTime: 2026-09-17 20:05:36
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\controller\core\business\AlarmController.ts
 */
import type { GenericController } from '../generic';
import type { AlarmProfileSyncData } from '../protocol';

export class AlarmController {
  constructor(private genericController: GenericController) {}

  /**
   * [EC-05-2] 警情精确上图控制 / 警情画像状态更新
   */
  public syncAlarmProfile(data: AlarmProfileSyncData) {
    console.log("🚀 ~ AlarmController ~ syncAlarmProfile ~ data:", data)
    const { view, geometry } = this.genericController;

    if (data.longitude && data.latitude) {
      view.locate({
        lngLat: [data.longitude, data.latitude],
        zoom: 18,
        duration: 800
      });

      geometry.addMarker({
        id: data.incidentId,
        lngLat: [data.longitude, data.latitude],
        // iconUrl: '/icons/fire.png',
        iconType: 'endpoint',
        iconParams: {
          type: 'alarm'
        },
        animate: 'breathe'
      });

      // 3条 机构id

      // 高亮围栏


    }
  }
}