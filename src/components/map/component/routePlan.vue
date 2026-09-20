<script setup lang="ts">
import { ref, toRaw, onMounted, computed } from "vue";
import { storeToRefs } from "pinia";
import { Draw } from "ol/interaction";
import Feature from "ol/Feature";
import { LineString } from "ol/geom";
import Overlay from "ol/Overlay";
import { Style, Icon, Stroke, Fill, Circle } from "ol/style";
import selectPointImg from "../assets/pointIng.png";
import { useMapStore, usePanelStore } from "../../../store";
import { PANEL_TYPES } from "../../../const/index.ts";
import endImg from "../assets/end.svg";
import startImg from "../assets/start.svg";
import rightImg from "../../../assets/right.png";
import { getStyleFunction } from "@/utils";
import {
  VECTOR_LAYER,
  LAYER_NAMES,
} from "../../../baseComponent/OpenlayersMap/layers.ts";
import BaseLayer from "ol/layer/Base";

const panelStore = usePanelStore();

const mapStore = useMapStore();

let vectorLayer:BaseLayer;

const PointFeature = ref({
  start_point: null,
  route_points: [],
  end_point: null,
});

const btnState = computed(() => {
  return (
    PointFeature.value.start_point &&
    PointFeature.value.end_point &&
    PointFeature.value.route_points.length
  );
});

const { map } = storeToRefs(mapStore);

const mapInstance = toRaw(map.value);

const activeIndex = ref("");

const listChildren = [
  { name: "起点", value: "start_point" },
  { name: "途径点", value: "route_points" },
  { name: "终点", value: "end_point" },
];

const changeActiveIndex = (index: string) => {
  activeIndex.value = index;
  drawStart();
};

const getEndpointStyle = (endType: string) => {
  return new Style({
    image: new Icon({
      anchor: [0.5, 1],
      src: endType == "end" ? endImg : startImg,
      scale: 0.6,
    }),
  });
};

const styles = {
  selectPointStyle: new Style({
    image: new Icon({
      anchor: [0.5, 1],
      src: selectPointImg,
      scale: 0.6,
    }),
  }),
};

const colors = {
  start_point: "#60DA78",
  end_point: "#F0533E",
  route_points: "#fff",
};

const getPointsStyle = () => {
  return new Style({
    image: new Circle({
      radius: activeIndex.value != listChildren[1].value ? 12 : 10,
      fill: new Fill({ color: colors[activeIndex.value] }),
      stroke: new Stroke({
        color: "black",
        width: 2,
      }),
    }),
  });
};

let draw: Draw | null = null;

const exitDraw = () => {
  if (draw) {
    mapInstance.removeInteraction(draw);
    draw = null;
    mapInstance.getTargetElement().style.cursor = "";
  }
};

const drawStart = () => {
  exitDraw();

  draw = new Draw({
    source: vectorLayer.getSource(),
    type: "Point",
    style: styles.selectPointStyle,
  });

  mapInstance.addInteraction(draw);

  draw.on("drawend", function (event) {
    const feature = event.feature;
    console.log(feature.getGeometry().getCoordinates(), event);
    if (activeIndex.value == listChildren[0].value) {
      //起点
      if (PointFeature.value.start_point) {
        vectorLayer.getSource().removeFeature(PointFeature.value.start_point);
      }

      PointFeature.value.start_point = feature;
    } else if (activeIndex.value == listChildren[1].value) {
      //途径点
      PointFeature.value.route_points.push(feature);
      const coordinates = feature.getGeometry().getCoordinates();
      addOverlay({
        coordinates,
        index: PointFeature.value.route_points.length,
      });
    } else {
      //终点
      if (PointFeature.value.end_point) {
        vectorLayer.getSource().removeFeature(PointFeature.value.end_point);
      }

      PointFeature.value.end_point = feature;
    }
    feature.setStyle(getPointsStyle());
  });
};

const createElement = (index: string) => {
  var element = document.createElement("div");
  element.className = `popMarker_path_route_points`;
  element.id = `popMarker_path_route_points_${index}`;
  element.innerHTML = index;
  return element;
};

let overlays: Overlay[] = [];
const popup = ref();

const addOverlay = ({ coordinates, index, type = "point" }) => {
  const overlay = new Overlay({
    element: type == "point" ? createElement(index) : popup.value,
    positioning: "bottom-center",
    offset: type == "point" ? [0, 70] : [200, 70],
    position: coordinates,
  });

  mapInstance.addOverlay(overlay);

  overlays.push(overlay);
};

onMounted(() => {
  vectorLayer = mapInstance
    .getLayers()
    .getArray()
    .find((i: { getClassName: () => string; }) => i.getClassName() == LAYER_NAMES.VECTOR_LAYER);
  if (!vectorLayer) {
    vectorLayer = VECTOR_LAYER();
    mapInstance.addLayer(vectorLayer);
  }
});

const PathResult = ref([]);

const drawLine = () => {
  PathResult.value = [];

  //起点
  PathResult.value.push(
    PointFeature.value.start_point.getGeometry().getCoordinates()
  );

  //途径点
  PointFeature.value.route_points.forEach((feature) => {
    PathResult.value.push(feature.getGeometry().getCoordinates());
  });

  //终点
  PathResult.value.push(
    PointFeature.value.end_point.getGeometry().getCoordinates()
  );

  const lineFeature = new Feature({
    geometry: new LineString(PathResult.value),
  });

  const lineStyle = getStyleFunction({
    color: "#25C2F2",
    width: 4,
    imgsrc: rightImg,
    wrapperRotation: (r: number) => -r,
  });

  lineFeature.setStyle(lineStyle);

  vectorLayer.getSource().addFeature(lineFeature);

  PointFeature.value.start_point.setStyle(getEndpointStyle("start"));
  PointFeature.value.end_point.setStyle(getEndpointStyle("end"));
};

const form = ref({
  name: "",
  mark: "",
});

const confirmHandle = () => {
  if (!btnState.value) {
    return;
  }
  drawLine();

  exitDraw();

  activeIndex.value = "";

  addPanel();
};

const addPanel = () => {
  let maxRightPoint = [0, 0];
  [...PathResult.value].forEach((point) => {
    if (point[0] > maxRightPoint[0]) {
      maxRightPoint = point;
    }
  });

  addOverlay({ coordinates: maxRightPoint, type: "panel" });
};

const cancelHandle = () => {
  exitDraw();

  activeIndex.value = "";

  vectorLayer.getSource().clear();

  overlays.forEach((overlay) => {
    mapInstance.removeOverlay(overlay);
  });

  PointFeature.value = {
    start_point: null,
    route_points: [],
    end_point: null,
  };

  panelStore.setPanelType(PANEL_TYPES.NULL);
};

const popupCancelHandle = () => {
  cancelHandle();
};

const popupConfirmHandle = () => {
  confirmHandle();
  PathResult.value = [];
};
</script>
<template>
  <div class="path_container">
    <div
      v-for="{ name, value } in listChildren"
      key="value"
      :class="{ item: true, active: activeIndex == value }"
      @click="() => changeActiveIndex(value)"
    >
      {{ name }}
    </div>
  </div>
  <div class="path_footer" v-show="activeIndex">
    <div @click="cancelHandle">取消</div>
    <div :class="{ active: btnState }" @click="() => confirmHandle()">完成</div>
  </div>

  <div
    class="point_route_popup"
    ref="popup"
    v-show="PathResult && PathResult.length"
  >
    <p class="head">路线</p>
    <div>
      <div class="item">
        <div>名称</div>
        <el-input
          v-model="form.name"
          style="width: 240px"
          placeholder="输入路径名称"
        />
      </div>
      <div class="item">
        <div>备注</div>
        <el-input
          v-model="form.mark"
          style="width: 240px"
          placeholder="输入路线附加信息"
        />
      </div>
    </div>
    <div class="footer">
      <div @click="popupCancelHandle">取消</div>
      <div @click="popupConfirmHandle">确认</div>
    </div>
  </div>
</template>
<style scoped lang="less">
.path_container {
  position: absolute;
  top: 60px;
  height: 120px;
  width: 104px;
  left: 40px;
  top: 64px;
  background: var(--widget-bg);
  border: 1px solid var(--widget-border);
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25) inset;
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  z-index: 5;

  .item {
    width: 100%;
    text-align: center;
    line-height: 40px;
    height: 40px;
    cursor: pointer;
    color: var(--text-secondary);
  }

  .item.active,
  .item:hover {
    background-color: var(--hover-bg);
    color: var(--text-primary);
    border-radius: 4px;
  }

  .item:nth-child(1).active,
  .item:nth-child(1):hover {
    border-radius: 8px 8px 0 0;
  }

  .item:nth-child(2) {
    margin: 2px 0;
  }

  .item:nth-child(3).active,
  .item:nth-child(3):hover {
    border-radius: 0px 0px 8px 8px;
  }
}
.path_footer {
  position: absolute;
  width: 300px;
  height: 60px;
  bottom: 36px;
  left: calc(50% - 150px);
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 5;
}
.path_footer > div {
  width: 120px;
  height: 60px;
  line-height: 60px;
  text-align: center;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 21px;
  font-weight: 700;
  color: var(--text-primary);
}
.path_footer > div:nth-child(1) {
  background: var(--widget-bg);
}
.path_footer > div:nth-child(2) {
  border: 1px solid var(--panel-border);
  background: rgba(60, 80, 80, 0.6);
  cursor: not-allowed;
  color: rgba(200, 200, 200, 0.5);
}

.path_footer div.active {
  background: var(--active-bg);
  color: var(--active-text);
  cursor: pointer;
  border-color: var(--active-border);
}

.point_route_popup {
  height: 170px;
  width: 334px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  box-shadow: var(--panel-shadow);
  color: var(--text-primary);

  p.head {
    color: var(--text-secondary);
    font-size: 14px;
    font-weight: 700;
    line-height: 20px;
    text-align: center;
    padding: 8.5px 0 10.5px;
    border-bottom: 1px solid var(--accent-cyan-soft);
  }

  div.item {
    display: flex;
    align-items: center;
    padding: 0 10px 10px;
    justify-content: space-around;
    color: var(--text-secondary);
  }

  div.footer {
    display: flex;
    border-top: 1px solid var(--accent-cyan-soft);
    align-items: center;
    height: calc(100% - 84px - 39px);
  }

  div.footer div {
    flex: 1;
    text-align: center;
    cursor: pointer;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    line-height: 20px;
    color: var(--text-primary);
  }

  div.footer div:first-child {
    border-right: 1px solid var(--accent-cyan-soft);
  }

  div.footer div:last-child {
    color: var(--accent-gold);
  }
}

html[data-theme="NIGHT"] {
  .path_footer > div:nth-child(2) {
    background: var(--card-bg);
    border-color: var(--card-border);
  }
  .point_route_popup {
    :deep(.el-input__wrapper) {
      background: var(--card-bg);
      box-shadow: 0 0 0 1px var(--card-border) inset;
    }
    :deep(.el-input__inner) {
      color: var(--text-primary);
    }
  }
}
</style>
