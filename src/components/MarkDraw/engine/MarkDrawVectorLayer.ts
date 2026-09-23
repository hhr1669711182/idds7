/**
 * 矢量图层管理：
 * - 优先复用 VECTOR_LAYER（className === LAYER_NAMES.VECTOR_LAYER）
 * - 否则自建 className = "MARK_DRAW_LAYER"，engine.destroy() 时仅移除自建图层
 */
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import type { Map as OLMap } from "ol";

export const LAYER_NAMES = {
  VECTOR_LAYER: "VECTOR_LAYER",
};

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
      const created = new VectorLayer({
        source: new VectorSource(),
      });
      // openlayers 没有直接的 setClassName，需通过 set("className") 或 properties
      (created as unknown as { set: (k: string, v: unknown) => void }).set(
        "className",
        "MARK_DRAW_LAYER"
      );
      map.addLayer(created);
      this.layer = created;
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
