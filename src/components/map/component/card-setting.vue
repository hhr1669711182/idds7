<script setup lang="ts">
import { markRaw } from "vue";
import { storeToRefs } from "pinia";
import { Draw } from "ol/interaction";
import type VectorLayer from "ol/layer/Vector";
import { useMapStore } from "../../../store";
import { LAYER_NAMES } from "../../../baseComponent/OpenlayersMap/layers";

const mapStore = useMapStore();

const { map } = storeToRefs(mapStore);

const draw = () => {
  // 矢量图层按 className 从地图里取（与 MarkDrawVectorLayer / clear.vue 同一套路）
  const vectorLayer = map.value
    ?.getLayers()
    .getArray()
    .find((layer: { getClassName: () => string }) => layer.getClassName() == LAYER_NAMES.VECTOR_LAYER) as
      | VectorLayer
      | undefined;

  if (!vectorLayer) {
    console.warn("[card-setting] 未找到矢量图层，无法绘制");
    return;
  }

  const draw = markRaw(new Draw({
    source: vectorLayer.getSource() ?? undefined,
    type: "Polygon",
    // style: this.style2,
  }));
  map.value?.addInteraction(draw);
};
</script>
<template>
  <div>设置</div>
  <el-button type="primary" @click="draw">画图</el-button>
  <el-button type="primary">挖空</el-button>
</template>
<style scoped></style>
