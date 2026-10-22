<script setup lang="ts">
import { onMounted, shallowRef, markRaw } from "vue";
import Map from "ol/Map";
import View from "ol/View";
import * as olProj from "ol/proj";
import { v4 as uuidv4 } from "uuid";
import {
  AMAP_LAYER,
  VECTOR_LAYER,
} from "../../../../baseComponent/OpenlayersMap/layers.ts";
import {
  CENTER,
  ZOOM,
} from "../../../../baseComponent/OpenlayersMap/const.map.ts";
import { SPATIAL_ANALYSIS_TYPES } from "../../../../const/index.ts";
import addCircleImg from "@/assets/icons-svg/map/画圆.svg";
import unionImg from "@/assets/icons-svg/map/并集.svg";
import intersectionImg from "@/assets/icons-svg/map/交集.svg";
import differenceImg from "@/assets/icons-svg/map/差集.svg";
import { DrawTool } from "../../MapTools";
import Feature from "ol/Feature";
import * as turf from "@turf/turf";
import { Style, Stroke, Fill } from "ol/style";
import { Polygon } from "ol/geom";
import type { Position } from "geojson";

let mapInstance: Map | null;
const vectoryLayer = VECTOR_LAYER();
const initMap = () => {
  mapInstance = markRaw(new Map({
    layers: [AMAP_LAYER("animationMap"), vectoryLayer],
    target: "animationMap",
    view: new View({
      center: olProj.fromLonLat(CENTER),
      zoom: ZOOM.INIT + 3,
    }),
  }));
};

const DRAWCICRLE = "DRAWCICRLE";

const list = [
  {
    txt: "画圆",
    type: DRAWCICRLE,
    src: addCircleImg,
  },
  {
    ...SPATIAL_ANALYSIS_TYPES[0],
    src: unionImg,
  },
  {
    ...SPATIAL_ANALYSIS_TYPES[1],
    src: intersectionImg,
  },
  {
    ...SPATIAL_ANALYSIS_TYPES[2],
    src: differenceImg,
  },
];

onMounted(() => {
  initMap();
});

let drawTool: DrawTool;

// shallowRef：避免 Vue 深层解包把 Feature 实例类型变形
let completedFeatures = shallowRef<Feature[]>([]);

const callback = ({ feature }: { feature: Feature }) => {
  completedFeatures.value.push(feature);
};

const drawCircle = () => {
  let uuid = uuidv4().replace(/-/g, "");
  drawTool = new DrawTool({
    map: mapInstance!,
    uuid,
    type: "Circle",
    cb: callback,
  });
  drawTool.init();
};

const getPolygons = () => {
  // 绘制工具产出的是 Polygon 要素；OL 的坐标为 Coordinate[]，转成 turf 的 Position[]
  const toTurfPolygon = (feature: Feature | undefined) => {
    const geometry = feature?.getGeometry() as Polygon | undefined;
    const coordinates = geometry?.getCoordinates() as number[][][] | undefined;
    if (!coordinates) return undefined;
    return turf.polygon(coordinates as Position[][]);
  };

  const p1 = toTurfPolygon(completedFeatures.value[0]);
  const p2 = toTurfPolygon(completedFeatures.value[1]);

  if (!p1 || !p2) return { p1: null, p2: null };

  return { p1, p2 };
};

const afterStyle = new Style({
  stroke: new Stroke({
    color: "#438ed8",
    width: 3,
  }),
  fill: new Fill({
    color: "rgba(255, 255, 255, 0.8)",
  }),
});

let feature: Feature;

const resetFeature = () => {
  if (feature) {
    vectoryLayer.getSource()?.removeFeature(feature);
  }
};
const handleUnionClick = () => {
  const { p1, p2 } = getPolygons();
  if (!p1 || !p2) return;
  const union = turf.union(turf.featureCollection([p1, p2]));
  if (union) {
    resetFeature();
    feature = new Feature({
      geometry: new Polygon(union.geometry.coordinates as number[][][]),
      zIndex: 9,
    });

    feature.setStyle(afterStyle);

    vectoryLayer.getSource()?.addFeature(feature);
  }
};

const handleInsertClick = () => {
  const { p1, p2 } = getPolygons();
  if (!p1 || !p2) return;
  const intersection = turf.intersect(turf.featureCollection([p1, p2]));
  if (intersection) {
    resetFeature();
    feature = new Feature({
      geometry: new Polygon(intersection.geometry.coordinates as number[][][]),
      zIndex: 9,
    });

    feature.setStyle(afterStyle);

    vectoryLayer.getSource()?.addFeature(feature);
  }
};

const handleDifferenceClick = () => {
  const { p1, p2 } = getPolygons();
  if (!p1 || !p2) return;
  const difference = turf.difference(turf.featureCollection([p1, p2]));
  if (difference) {
    resetFeature();
   feature = new Feature({
      geometry: new Polygon(difference.geometry.coordinates as number[][][]),
      zIndex: 9,
    });

    feature.setStyle(afterStyle);

    vectoryLayer.getSource()?.addFeature(feature);
  }
};
const handleClick = (item: { type: string }) => {
  const { type } = item;
  switch (type) {
    case list[0].type:
      drawCircle();
      break;
    case list[1].type:
      handleUnionClick();
      break;
    case list[2].type:
      handleInsertClick();
      break;
    case list[3].type:
      handleDifferenceClick();
      break;
  }
};
</script>
<template>
  <div id="animationMap"></div>
  <div class="btn_container">
    <ul>
      <li v-for="item in list">
        <div
          v-if="
            (completedFeatures.length == 2 && item.type != list[0].type) ||
            (completedFeatures.length < 3 && item.type == list[0].type)
          "
          class="pointer"
          @click="
            () => {
              handleClick(item);
            }
          "
        >
          <img :src="item.src" alt="" />
          <span>{{ item.txt }}</span>
        </div>
        <div v-else>
          <img :src="item.src" alt="" />
          <span>{{ item.txt }}</span>
        </div>
      </li>
    </ul>
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
  background-color: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 4px;
}

ul {
  list-style: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: none;
}

li {
  margin-bottom: 10px;
}

li div {
  width: 100%;
  display: flex;
  align-items: center;
  cursor: not-allowed;
}
li div.pointer {
  cursor: pointer;
}

img {
  margin-right: 4px;
  width: 20px;
  height: 20px;
}
</style>
