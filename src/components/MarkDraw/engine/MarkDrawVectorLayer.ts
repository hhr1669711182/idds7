/**
 * 矢量图层管理：
 * - 优先复用 VECTOR_LAYER（className === LAYER_NAMES.VECTOR_LAYER，与 map 底座一致）
 * - 否则自建同名 className 的图层，使 map 侧工具（components/map/MapTools）也能命中同一图层
 * - engine.destroy() 时仅移除自建图层
 */
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import type { Map as OLMap } from "ol";
import { LAYER_NAMES } from "@/baseComponent/OpenlayersMap/layers";

export class MarkDrawVectorLayer {
  readonly map: OLMap;
  readonly layer: VectorLayer<VectorSource>;
  readonly owned: boolean;

  constructor(map: OLMap) {
    this.map = map;
    const found = map
      .getLayers()
      .getArray()
      .find(
        (l): l is VectorLayer<VectorSource> =>
          l instanceof VectorLayer &&
          (l as unknown as { getClassName?: () => string }).getClassName?.() ===
            LAYER_NAMES.VECTOR_LAYER
      );

    if (found) {
      this.layer = found;
      this.owned = false;
    } else {
      // 与 map 底座使用同名 className，保证复用 map 工具时能取到同一图层
      this.layer = new VectorLayer({
        source: new VectorSource(),
        className: LAYER_NAMES.VECTOR_LAYER,
      });
      map.addLayer(this.layer);
      this.owned = true;
    }
  }

  get source(): VectorSource {
    return this.layer.getSource()!;
  }

  destroy(): void {
    if (this.owned) {
      this.map.removeLayer(this.layer);
    }
  }
}