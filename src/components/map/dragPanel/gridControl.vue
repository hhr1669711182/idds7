<script setup>
import { toRaw } from "vue";
import { storeToRefs } from "pinia";
import { Graticule } from "ol/layer";
import { useMapStore } from "../../../store/index";
import {
  GRID_LAYER,
  LAYER_NAMES,
} from "../../../baseComponent/OpenlayersMap/layers";

const mapStore = useMapStore();

const { showGrid, map } = storeToRefs(mapStore);

const changeHandle = (visible) => {
  const mapInstance = toRaw(map.value);
  let layer = mapInstance
    .getLayers()
    .getArray()
    .find((i) => i.getClassName() == LAYER_NAMES.GRID_LAYER);
  if (!layer) {
    mapInstance.addLayer(GRID_LAYER);
    layer = GRID_LAYER;
  }

  layer.setVisible(visible);
};
</script>

<template>
  <div>
    <el-checkbox label="经纬网格" v-model="showGrid" @change="changeHandle" />
  </div>
</template>

<style scoped></style>
