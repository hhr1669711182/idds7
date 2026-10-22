<script setup lang="ts">
import { ref, onMounted } from "vue";
import Feature from "ol/Feature";
import OLMap from "ol/Map";
import View from "ol/View";
import { Style, Fill, Stroke, Text } from "ol/style";
import LayerVector from "ol/layer/Vector";
import SourceVector from "ol/source/Vector";
import lands from "@/assets/map/geo/lands.json";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat } from "ol/proj";
import { Geometry } from "ol/geom";

const highlightStyle = new Style({
  stroke: new Stroke({
    color: "#f00",
    width: 1,
  }),
  fill: new Fill({
    color: "rgba(255, 0, 0, 0.1)",
  }),
  text: new Text({
    font: "12px Calibri, sans-serif",
    fill: new Fill({
      color: "#000",
    }),
    stroke: new Stroke({
      color: "#f00",
      width: 3,
    }),
  }),
});

/** 要素信息浮层 DOM（模板中的 ref="infoRef"） */
const infoRef = ref<HTMLElement | null>(null);

/**
 * 地图实例与高亮要素的引用。
 *
 * 显式标注类型，避免 `ref(null)` 把类型推断死成 `null`，
 * 导致后续所有属性访问都退化成「可能为空 / 属性不存在」的类型错误。
 */
const map = ref<OLMap | null>(null);

const highlight = ref<Feature<Geometry> | null>(null);

let featureOverlay: LayerVector | null = null;

const displayFeatureInfo = (pixel: any) => {
  // 创建高亮图层
  if (!featureOverlay) {
    featureOverlay = new LayerVector({
      source: new SourceVector(),
      map: (map.value ?? undefined) as OLMap | undefined,
      style: (feature) => {
        highlightStyle.getText()?.setText(feature.get("name"));
        return highlightStyle;
      },
    });
  }
  // 获取点击的要素
  let feature = map.value?.forEachFeatureAtPixel(pixel, (feature) => feature) as
    | Feature<Geometry>
    | undefined;
  let info = infoRef.value;
  // 获取要素信息
  if (feature && info) {
    info.innerHTML = feature.getId() + ": " + feature.get("name");
  } else if (info) {
    info.innerHTML = "&nbsp;";
  }
  // 设置高亮要素
  if (feature !== highlight.value) {
    if (highlight.value) {
      featureOverlay.getSource()?.removeFeature(highlight.value);
    }

    if (feature) {
      featureOverlay.getSource()?.addFeature(feature);
    }
    highlight.value = feature ?? null;
  }
};

const initMap = () => {
  let style = new Style({
    fill: new Fill({
      color: "rgba(255, 255, 255, 0.6)",
    }),
    stroke: new Stroke({
      color: "#319FD3",
      width: 1,
    }),
    text: new Text({
      font: "12px Calibri,sans-serif",
      fill: new Fill({
        color: "#000",
      }),
      stroke: new Stroke({
        color: "#fff",
        width: 3,
      }),
    }),
  });

  let vectorLayer = new LayerVector({
    source: new SourceVector({
      features: new GeoJSON({
        featureProjection: "EPSG:3857",
      }).readFeatures(lands),
      format: new GeoJSON(),
      wrapX: true,
    }),
    style: (feature) => {
      style.getText()?.setText(feature.get("name"));
      return style;
    },
  });

  const mapInstance = new OLMap({
    target: "modal_map",
    layers: [vectorLayer],
    view: new View({
      center: fromLonLat([0, 0]),
      zoom: 1,
    }),
  });
  map.value = mapInstance;

  mapInstance.on("pointermove", (evt) => {
    if (evt.dragging) {
      return;
    }
    let pixel = mapInstance.getEventPixel(evt.originalEvent);
    displayFeatureInfo(pixel);
  });

  mapInstance.on("click", (evt) => {
    displayFeatureInfo(evt.pixel);
  });
};

onMounted(() => {
  initMap();
});
</script>
<template>
  <div class="vm">
    <div class="info" ref="infoRef"></div>
    <div id="modal_map" class="map-x"></div>
  </div>
</template>
<style scoped>
.vm {
  height: 100%;
  width: 100%;
}
#modal_map {
  height: 100%;
  width: 100%;
}

.info {
  position: absolute;
  text-align: center;
  top: 10px;
  font-weight: 700;
  text-align: center;
  color: red;
  width: 100%;
  z-index: 5;
}
</style>
