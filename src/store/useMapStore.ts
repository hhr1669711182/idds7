/*
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-08-28 19:22:07
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\store\useMapStore.ts
 */
import { defineStore } from "pinia";
import { markRaw, toRaw } from "vue";
import { Map } from "ol";
import { CENTER, ZOOM } from "@/baseComponent/OpenlayersMap/const.map";
import { fromLonLat } from "ol/proj";

export interface MapState {
  map: any;
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
      map: {},
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
      this.map = markRaw(toRaw(map));
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