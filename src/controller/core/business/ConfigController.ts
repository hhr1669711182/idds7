import type { GenericController } from '../generic';
import type { ConfigLayersData, ConfigBaseData, ConfigClearStrategyData } from '../protocol';

export class ConfigController {
  constructor(private genericController: GenericController) {}

  /**
   * [GC-01] 资源图层配置
   */
  public configLayers(data: ConfigLayersData) {
    const { view } = this.genericController;
    data.layers.forEach(layer => {
      view.layerToggle({ layerId: layer.id, visible: layer.visible });
    });
  }

  /**
   * [GC-02] 基础参数配置
   */
  public configBase(data: ConfigBaseData) {
    const { view } = this.genericController;
    view.locate({
      lngLat: data.defaultCenter,
      zoom: data.defaultZoom
    });
  }

  /**
   * [GC-03] 清除策略配置
   */
  public configClearStrategy(data: ConfigClearStrategyData) {
    console.log('[GC-03] 清除策略配置已应用', data);
    // TODO: 实现具体缓存清理或记录历史功能
  }
}