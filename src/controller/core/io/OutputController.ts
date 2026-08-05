/*
 * @Author: hhr
 * @Date: 2026-07-01 11:12:49
 * @LastEditTime: 2026-07-01 11:22:44
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\controller\core\io\OutputController.ts
 */
import type { MapViewChangedData, MapFeaturePickData, RoutePlanResultData, MapLayerVisibleChangeData } from '../protocol';
import { useMessageStore } from '@/store/useMessageStore';
import { MESSAGE_SYSTEM, MESSAGE_CHANNEL, MESSAGE_EVENT_KEY } from '@/const/const.message.type';

export class OutputController {
  
  /**
   * 抛出视图变更事件
   */
  public emitMapViewChanged(data: MapViewChangedData) {
    const store = useMessageStore();
    store.publish(MESSAGE_EVENT_KEY.MAP_VIEW_CHANGED, data, {
      system: MESSAGE_SYSTEM.MAP,
      channel: MESSAGE_CHANNEL.WS, // 或者根据需要配置为 POST_MESSAGE
    });
  }

  /**
   * 抛出地图要素拾取事件
   */
  public emitMapFeaturePick(data: MapFeaturePickData) {
    const store = useMessageStore();
    store.publish(MESSAGE_EVENT_KEY.MAP_FEATURE_PICK, data, {
      system: MESSAGE_SYSTEM.MAP,
      channel: MESSAGE_CHANNEL.WS,
    });
  }

  /**
   * 抛出路径规划结果事件
   */
  public emitRoutePlanResult(data: RoutePlanResultData) {
    const store = useMessageStore();
    store.publish(MESSAGE_EVENT_KEY.ROUTE_PLAN_RESULT, data, {
      system: MESSAGE_SYSTEM.MAP,
      channel: MESSAGE_CHANNEL.WS,
    });
  }

  /**
   * 抛出图层显隐状态变更事件
   */
  public emitMapLayerVisibleChange(data: MapLayerVisibleChangeData) {
    const store = useMessageStore();
    store.publish(MESSAGE_EVENT_KEY.MAP_LAYER_VISIBLE_CHANGE, data, {
      system: MESSAGE_SYSTEM.MAP,
      channel: MESSAGE_CHANNEL.WS,
    });
  }
}