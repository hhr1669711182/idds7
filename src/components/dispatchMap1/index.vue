<!--
 * @Author: ljh
 * @Date: 2026-08-27 10:30:08
 * @LastEditTime: 2026-08-27 10:39:46
 * @LastEditors: ljh
 * @Description: Dispatch1 消防力量调派地图页面组件。
 * @FilePath: src\components\dispatchMap1\index.vue
-->
<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import type OlMap from 'ol/Map';
import ScaleLine from 'ol/control/ScaleLine';
import OpenlayersMap from '@/baseComponent/OpenlayersMap/dispatchMap.vue';
import DispatchT1Panel from '@/baseComponent/OpenlayersMap/DispatchT1.vue';
import type {
  DispatchT1State,
  DispatchT1VehicleCommand,
} from '@/baseComponent/OpenlayersMap/DispatchT1';
import { useDispatch1MapStore } from '@/store/useDispatch1MapStore';
import { usePendingDispatchAlarmStore } from '@/store/usePendingDispatchAlarmStore';
import { useLayersStore } from '@/store/useLayersStore';
import {
  fetchMapConfig,
  getToolbarLayerConfigs,
} from '@/config/mapConfig';
import Compass from '@/components/map/compass.vue';
import BottomRightPanel from '@/components/map/brp.vue';
import Dispatch1Layers from './Dispatch1Layers.vue';
import { TEMP_FRONTEND_LAYER_IDS } from '@/baseComponent/OpenlayersMap/layers';
import { readScaleLineUnit } from '@/config/scaleLine';

type OpenlayersMapExpose = {
  syncLayers: (ids: string[]) => void;
};

const dispatch1MapStore = useDispatch1MapStore();
const pendingDispatchAlarmStore = usePendingDispatchAlarmStore();
const layersStore = useLayersStore();
const mapRef = shallowRef<OpenlayersMapExpose | null>(null);
const olMap = shallowRef<OlMap | null>(null);
const pageRef = ref<HTMLElement | null>(null);
const pendingAlarmProfile = computed(() => pendingDispatchAlarmStore.profile);

const getDispatch1LayerIds = (ids: string[]) =>
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
      map.renderSync();
    });
  });
};

watch(
  () => dispatch1MapStore.checkedIds,
  (ids) => {
    const nextIds = getDispatch1LayerIds(ids);
    if (nextIds.length !== ids.length) {
      dispatch1MapStore.setCheckedIds(nextIds);
      return;
    }
    mapRef.value?.syncLayers(nextIds);
  },
  { deep: true, immediate: true },
);

watch(pendingAlarmProfile, () => nextTick(refreshMapViewport));

const setMap = (map: OlMap) => {
  dispatch1MapStore.setMap(map);
  olMap.value = map;
  // 基础地图完成自身初始化后，再用 Dispatch1 的独立状态覆盖初始图层。
  nextTick(() => {
    mapRef.value?.syncLayers(getDispatch1LayerIds(dispatch1MapStore.checkedIds));
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
  if (dispatch1MapStore.map === olMap.value) dispatch1MapStore.map = null;
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
    dispatch1MapStore.setCheckedIds(
      getDispatch1LayerIds(
        dispatch1MapStore.checkedIds.filter((id) => availableIds.has(id)),
      ),
    );
    await nextTick();
    mapRef.value?.syncLayers(dispatch1MapStore.checkedIds);
    refreshMapViewport();
  } catch (error) {
    console.error('[Dispatch1] 加载图层配置失败', error);
  }
});
</script>

<template>
  <div ref="pageRef" class="dispatch1-page">
    <OpenlayersMap ref="mapRef" map-id="dispatch1-map" @set-map="setMap" />
    <DispatchT1Panel
      :map="olMap"
      :websocket-data="pendingAlarmProfile"
      @dispatch="handleDispatch"
      @query-success="handleQuerySuccess"
      @error="handleDispatchError"
    />

    <Dispatch1Layers />
    <Compass />
    <BottomRightPanel />
  </div>
</template>

<style scoped>
.dispatch1-page {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
}
:global(#dispatch1-map) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  touch-action: none;
}
:global(#dispatch1-map .ol-scale-line) {
  left: 4em !important;
  bottom: 0 !important;
  z-index: 2;
}
</style>
