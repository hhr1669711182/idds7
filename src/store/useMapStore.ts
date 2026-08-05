/*
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-06-15 19:13:15
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\store\useMapStore.ts
 */
import { defineStore } from "pinia";
import { Map } from "ol";
import { CENTER, ZOOM } from "@/baseComponent/OpenlayersMap/const.map";
import { fromLonLat } from "ol/proj";

export interface MapState {
  map: Map | null;
  mode: string;
  showGrid: boolean;
  showWaterMarker: boolean;
  showSwipe: boolean;
  model: {
    name: string;
    code: string;
  };
}

export const useMapStore = defineStore("mapStore", {
  state: (): MapState => {
    return {
      map: null,
      mode: "2D",
      showGrid: false,
      showWaterMarker: false,
      showSwipe: false,

      model: {
        name: "灾情模式", //当前模式
        code: "", //模式代码
      },
    };
  },
  actions: {
    setMap(map: Map) {
      this.map = map;
    },
    resetMapView() {
      this.map?.getView().animate({
        center: fromLonLat(CENTER),
        zoom: ZOOM.INIT,
      });
    },
    setMapMode(mode: string) {
      this.mode = mode;
      return { mode };
    },
    setShowGrid(visible: boolean) {
      this.showGrid = visible;
    },
  },
});
