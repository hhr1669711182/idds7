/*
 * @Author: hhr
 * @Date: 2026-06-01 18:26:24
 * @LastEditTime: 2026-06-01 18:46:05
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\map\MapTools\ThemeTools\TrafficTools.ts
 */
import Map from "ol/Map";
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";

import { createAmapLayer } from "@/baseComponent/tools/amap";

export class TrafficTools {
  map: Map;
  trafficLayer: TileLayer<XYZ> | null = null;
  visible: boolean = false;

  constructor(map: Map) {
    this.map = map;
    this.create();
  }

  create() {
    if (!this.trafficLayer) {
      this.trafficLayer = createAmapLayer({
        mapType: 'traffic',
        visible: false,
      })
        this.map.addLayer(this.trafficLayer);
    }
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    if (this.trafficLayer) {
      this.trafficLayer.setVisible(visible);
    }
  }

  remove() {
    if (this.trafficLayer) {
      this.map.removeLayer(this.trafficLayer);
      this.trafficLayer = null;
    }
  }
}
