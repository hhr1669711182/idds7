import Map from "ol/Map";
import AnimatedCanvas from "ol-ext/overlay/AnimatedCanvas";
import Cloud from "ol-ext/particule/Cloud";
import Snow from "ol-ext/particule/Snow";
import RainDrop from "ol-ext/particule/RainDrop";
import Rain from "ol-ext/particule/Rain";
import { LAYER_NAMES } from "../../../../baseComponent/OpenlayersMap/layers";
import BaseLayer from "ol/layer/Base";

export class WeatherTools {
  map: Map;
  cloud: AnimatedCanvas;
  AMAP_LAYER: BaseLayer | undefined;
  GOOGLE_LAYER: BaseLayer | undefined;
  constructor({ map }: { map: Map }) {
    this.map = map;
    this.initWeatherMap();
  }
  initWeatherMap() {
    this.AMAP_LAYER = this.map
      .getLayers()
      .getArray()
      .find((i) => i.getClassName() == LAYER_NAMES.AMAP_LAYER);

    this.GOOGLE_LAYER = this.map
      .getLayers()
      .getArray()
      .find((i) => i.getClassName() == LAYER_NAMES.GOOGLE_LAYER);

    this.AMAP_LAYER?.setVisible(false);
    this.GOOGLE_LAYER?.setVisible(true);

    // cloud
    this.cloud = new AnimatedCanvas({
      particule: Cloud,
      density: 1.5,
      angle: Math.PI / 4,
      speed: 2,
    });
    this.map.addOverlay(this.cloud);

    //snow
    var snow = new AnimatedCanvas({
      particule: Snow,
      density: 5,
      angle: Math.PI / 2,
      speed: 0.5,
    });

    snow.setVisible(false);
    this.map.addOverlay(snow);

    // rainDrop
    var raindrop = new AnimatedCanvas({
      particule: RainDrop,
      density: 1,
      speed: 5,
    });
    raindrop.setVisible(false);
    this.map.addOverlay(raindrop);

    // Rain
    var rain = new AnimatedCanvas({
      particule: Rain,
      density: 1,
      angle: (2 * Math.PI) / 5,
      speed: 5,
    });
    rain.setVisible(false);
    this.map.addOverlay(rain);
  }
  remove() {
    this.map.removeOverlay(this.cloud);
    this.AMAP_LAYER.setVisible(true);
    this.GOOGLE_LAYER.setVisible(false);
  }
}
