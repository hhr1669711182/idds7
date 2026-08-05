import type { GenericController } from '../generic';
import type { LayerSetVisibleData, MapViewLoadData } from '../protocol';

export class DutyController {
  constructor(private genericController: GenericController) {}

  /**
   * [EC-01] 基础图层资源显隐和配置
   */
  public layerSetVisible(data: LayerSetVisibleData) {
    const { view } = this.genericController;
    view.layerToggle({
      layerId: data.layerId,
      visible: data.visible ?? true
    });
  }

  /**
   * [EC-02] 围栏集合 AOI 定位控制
   */
  public mapViewLoad(data: MapViewLoadData) {
    const { view } = this.genericController;
    if (data.points && data.points.length > 0) {
      view.fitBounds({
        geometry: { type: 'Polygon', coordinates: [data.points] },
        padding: data.padding || [50, 50, 50, 50]
      });
    } else if (data.longitude && data.latitude) {
      view.locate({
        lngLat: [data.longitude, data.latitude],
        zoom: data.zoom || 15
      });
    }
  }
}