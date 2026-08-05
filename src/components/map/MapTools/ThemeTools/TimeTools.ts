import Map from "ol/Map";
import { Style, Circle, Fill } from "ol/style";
import * as DayNight from "ol-ext/source/DayNight";
import { Vector as VectorLayer } from "ol/layer";

export class TimeTools {
  map: Map;
  vecLayer!: VectorLayer;
  constructor({ map }: { map: Map }) {
    this.map = map;
    this.initHeatMap();
  }
  initHeatMap() {
    var vectorSource = new DayNight.default({});
    this.vecLayer = new VectorLayer({
      source: vectorSource,
      style: new Style({
        image: new Circle({
          radius: 5,
          fill: new Fill({ color: "red" }),
        }),
        fill: new Fill({
          color: [0, 0, 50, 0.5],
        }),
      }),
    });

    this.map.addLayer(this.vecLayer);
  }

  remove() {
    this.map.removeLayer(this.vecLayer);
  }
}
