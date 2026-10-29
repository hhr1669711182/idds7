<!--
 * @Author: ljh
 * @Date: 2026-08-27 10:30:08
 * @LastEditTime: 2026-10-29 17:49:00
 * @LastEditors: huanghuanrong
 * @Description: 消防力量调派地图页面组件（T1 转正，原 dispatch1）。
 * @FilePath: src\components\dispatchMap\index.vue
-->
<script setup lang="ts">
import { nextTick, onActivated, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import type OlMap from 'ol/Map';
import ScaleLine from 'ol/control/ScaleLine';
import OpenlayersMap from '@/baseComponent/OpenlayersMap/dispatchMap.vue';
import DispatchT1Panel from '@/baseComponent/OpenlayersMap/DispatchT1.vue';
import type {
  DispatchT1State,
  DispatchT1VehicleCommand,
} from '@/baseComponent/OpenlayersMap/DispatchT1';
import { useDispatchMapStore } from '@/store/useDispatchMapStore';
import { usePendingDispatchAlarmStore } from '@/store/usePendingDispatchAlarmStore';
import { useLayersStore } from '@/store/useLayersStore';
import {
  fetchMapConfig,
  getToolbarLayerConfigs,
} from '@/config/mapConfig';
import Compass from '@/components/map/compass.vue';
import BottomRightPanel from '@/components/map/brp.vue';
import DispatchLayers from './DispatchLayers.vue';
import VehicleTrackPanel from './VehicleTrackPanel.vue';
import { useVehicleTrackStore } from '@/store/useVehicleTrackStore';
import { TEMP_FRONTEND_LAYER_IDS } from '@/baseComponent/OpenlayersMap/layers';
import { readScaleLineUnit } from '@/config/scaleLine';

type OpenlayersMapExpose = {
  syncLayers: (ids: string[]) => void;
};

const dispatchMapStore = useDispatchMapStore();
const pendingDispatchAlarmStore = usePendingDispatchAlarmStore();
const layersStore = useLayersStore();
const vehicleTrackStore = useVehicleTrackStore();
const mapRef = shallowRef<OpenlayersMapExpose | null>(null);
const olMap = shallowRef<OlMap | null>(null);
const pageRef = ref<HTMLElement | null>(null);

const getDispatchLayerIds = (ids: string[]) =>
  ids.filter((id) => id !== TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER);

let viewportRefreshFrame: number | null = null;
let viewportResizeObserver: ResizeObserver | null = null;

const refreshMapViewport = () => {
  if (viewportRefreshFrame !== null) {
    cancelAnimationFrame(viewportRefreshFrame);
  }
  viewportRefreshFrame = requestAnimationFrame(() => {
    viewportRefreshFrame = requestAnimationFrame(() => {
      viewportRefreshFrame = null;
      const map = olMap.value;
      if (!map || disposed) return;

      map.updateSize();
      const hasScaleLine = map
        .getControls()
        .getArray()
        .some((control) => control instanceof ScaleLine);
      if (!hasScaleLine) {
        map.addControl(new ScaleLine({ units: readScaleLineUnit() }));
      }
      try { map.renderSync(); } catch { /* 地图过渡期 renderer 未就绪，忽略 */ }
    });
  });
};

watch(
  () => dispatchMapStore.checkedIds,
  (ids) => {
    const nextIds = getDispatchLayerIds(ids);
    if (nextIds.length !== ids.length) {
      dispatchMapStore.setCheckedIds(nextIds);
      return;
    }
    mapRef.value?.syncLayers(nextIds);
  },
  { deep: true, immediate: true },
);

const setMap = (map: OlMap) => {
  dispatchMapStore.setMap(map);
  olMap.value = map;
  // 基础地图完成自身初始化后，再用调派页的独立状态覆盖初始图层。
  nextTick(() => {
    mapRef.value?.syncLayers(getDispatchLayerIds(dispatchMapStore.checkedIds));
    refreshMapViewport();
  });
};

const handleDispatch = (command: DispatchT1VehicleCommand) => {
  console.info('[DispatchT1] 服务端已确认车辆调派', command);
};

const handleDispatchError = (error: unknown) => {
  console.error('[DispatchT1] 消防调派处理失败', error);
};

const handleQuerySuccess = (state: Readonly<DispatchT1State>) => {
  pendingDispatchAlarmStore.consume(state.incident?.id);
  // 警情已上图，Overlay 弹出后地图容器尺寸与比例尺需要重算。
  nextTick(refreshMapViewport);
};

let disposed = false;
onUnmounted(() => {
  disposed = true;
  viewportResizeObserver?.disconnect();
  viewportResizeObserver = null;
  if (viewportRefreshFrame !== null) {
    cancelAnimationFrame(viewportRefreshFrame);
    viewportRefreshFrame = null;
  }
  if (dispatchMapStore.map === olMap.value) dispatchMapStore.map = null;
  olMap.value = null;
});

onActivated(() => nextTick(refreshMapViewport));

onMounted(async () => {
  if (pageRef.value) {
    viewportResizeObserver = new ResizeObserver(refreshMapViewport);
    viewportResizeObserver.observe(pageRef.value);
  }
  try {
    const mapConfig = await fetchMapConfig();
    if (disposed) return;
    // 与主界面共用图层定义，但不覆盖主界面的图层勾选状态。
    layersStore.setLayerConfigs(getToolbarLayerConfigs(mapConfig));
    const availableIds = new Set(layersStore.items.map((item) => item.id));
    dispatchMapStore.setCheckedIds(
      getDispatchLayerIds(
        dispatchMapStore.checkedIds.filter((id) => availableIds.has(id)),
      ),
    );
    await nextTick();
    mapRef.value?.syncLayers(dispatchMapStore.checkedIds);
    refreshMapViewport();
  } catch (error) {
    console.error('[dispatch] 加载图层配置失败', error);
  }
});
</script>

<template>
  <div ref="pageRef" class="dispatch-page">
    <OpenlayersMap ref="mapRef" map-id="dispatch-map" @set-map="setMap" />
    <DispatchT1Panel
      :map="olMap"
      @dispatch="handleDispatch"
      @query-success="handleQuerySuccess"
      @error="handleDispatchError"
    />

    <DispatchLayers />
    <VehicleTrackPanel v-if="vehicleTrackStore.panelVisible" />
    <Compass />
    <BottomRightPanel />
  </div>
</template>

<style scoped>
.dispatch-page {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
}
:global(#dispatch-map) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
}
:global(#dispatch-map .ol-scale-line) {
  left: 4em !important;
  bottom: 0 !important;
  z-index: 2;
}
</style>
