<script setup>
import { toRaw } from "vue";
import { storeToRefs } from "pinia";
import { useMapStore } from "../../../store/index";
import {
  LAYER_NAMES,
  WATER_LAYER,
} from "../../../baseComponent/OpenlayersMap/layers";

const mapStore = useMapStore();

//水印瓦片图层
const getWaterMarkLayer = WATER_LAYER({});

const { showWaterMarker, map } = storeToRefs(mapStore);

const changeHandle = (visible) => {
  const mapInstance = toRaw(map.value);
  let layer = mapInstance
    .getLayers()
    .getArray()
    .find((i) => i.getClassName() == LAYER_NAMES.WATER_LAYER);
  if (!layer) {
    mapInstance.addLayer(getWaterMarkLayer);
    layer = getWaterMarkLayer;
  }

  layer.setVisible(visible);
};
</script>

<template>
  <div>
    <el-checkbox
      label="地图水印"
      v-model="showWaterMarker"
      @change="changeHandle"
    />
  </div>
</template>

<style scoped></style>
