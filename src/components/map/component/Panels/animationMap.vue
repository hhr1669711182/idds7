<script setup lang="ts">
import { onMounted } from "vue";
import Map from "ol/Map";
import View from "ol/View";
import * as olProj from "ol/proj";
import { AMAP_LAYER } from "../../../../baseComponent/OpenlayersMap/layers.ts";
import {
  CENTER,
  ZOOM,
  ANIMATE_TYPES,
} from "../../../../baseComponent/OpenlayersMap/const.map.ts";
import { easeOut, easeIn } from "ol/easing";
import { Coordinate } from "ol/coordinate";

let mapInstance: Map;
const initMap = () => {
  console.log(AMAP_LAYER);
  mapInstance = new Map({
    layers: [AMAP_LAYER("animationMap")],
    target: "animationMap",
    view: new View({
      center: olProj.fromLonLat(CENTER),
      zoom: ZOOM.INIT+3,
    }),
  });
};
const bounce = (t: number) => {
  // 弹跳动画
  let s = 7.5625;
  let p = 2.75;
  let l;
  if (t < 1 / p) {
    l = s * t * t;
  } else {
    if (t < 2 / p) {
      t -= 1.5 / p;
      l = s * t * t + 0.75;
    } else {
      if (t < 2.5 / p) {
        t -= 2.25 / p;
        l = s * t * t + 0.9375;
      } else {
        t -= 2.625 / p;
        l = s * t * t + 0.984375;
      }
    }
  }
  return l;
};
const handleBtnClick = (type: { value: any; coordinate: any; }) => {
  const { value, coordinate } = type;
  switch (value) {
    case ANIMATE_TYPES[0].value:
      mapInstance.getView().animate({
        center: olProj.fromLonLat(coordinate),
      });
      break;
    case ANIMATE_TYPES[1].value:
      mapInstance.getView().animate({
        center: olProj.fromLonLat(coordinate),
        easing: easeOut,
      });
      break;
    case ANIMATE_TYPES[2].value:
      mapInstance.getView().animate({
        center: olProj.fromLonLat(coordinate),
        easing: bounce,
        duration: 2000,
      });
      break;
    case ANIMATE_TYPES[3].value:
      mapInstance.getView().animate(
        {
          // 将多个动画连在一起使用
          center: olProj.fromLonLat(coordinate),
          rotation: Math.PI,
          easing: easeIn,
        },
        {
          center: olProj.fromLonLat(coordinate),
          rotation: 2 * Math.PI, // 旋转角度
          easing: easeOut,
        }
      );
      break;
    case ANIMATE_TYPES[4].value:
      const rotation = mapInstance.getView().getRotation();
      mapInstance.getView().animate(
        {
          // 将多个动画连在一起使用
          rotation: rotation + Math.PI,
          anchor: olProj.fromLonLat(coordinate), // 锚点
          easing: easeIn, // 动画：传入动画函数
        },
        {
          rotation: rotation + 2 * Math.PI,
          anchor: olProj.fromLonLat(coordinate), // 锚点
          easing: easeOut, // 动画：传入动画函数
        }
      );
      break;
    case ANIMATE_TYPES[5].value:
      const location = olProj.fromLonLat(coordinate);
      flyTo(location);
      break;
  }
};

const flyTo = (location: Coordinate, done = () => {}) => {
  // 飞行动画
  let view = mapInstance.getView();
  let duration = 2000;
  let zoom = view.getZoom();
  let parts = 2;
  let called = false;
  function callback(complete: any) {
    --parts;
    if (called) {
      return;
    }
    if (parts === 0 || !complete) {
      called = true;
      done(complete);
    }
  }

  view.animate(
    {
      center: location,
      duration: duration,
    },
    callback
  );
  view.animate(
    {
      zoom: zoom - 1,
      duration: duration / 2,
    },
    {
      zoom: zoom,
      duration: duration / 2,
    },
    callback
  );
};

onMounted(() => {
  initMap();
});
</script>
<template>
  <div id="animationMap"></div>
  <div class="btn_container">
    <el-button
      round
      v-for="type in ANIMATE_TYPES"
      @click="() => handleBtnClick(type)"
      >{{ type.txt }}</el-button
    >
  </div>
</template>
<style scoped>
#animationMap {
  height: 100%;
  width: 100%;
}
.btn_container {
  position: absolute;
  z-index: 5;
  top: 10px;
  right: 20px;
  display: flex;
  flex-direction: column;
  button {
    margin-bottom: 5px;
  }
}
</style>
