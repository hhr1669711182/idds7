<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";
import type { AutocompleteData, AutocompleteFetchSuggestions } from "element-plus";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import { toLonLat } from "ol/proj";
import { isOlMap } from "@/utils/mapTool";


import { amapApi, type PoiFeature, type PoiFeatureCollection } from "@/apis/amap";
import { amapGcj02ToWgs84, toAmapLngLatString } from "@/baseComponent/amap/amapCoordinate";
import { useSearchPanelStore } from "@/store";
import { useCurrentMap } from "@/composables/useCurrentMap";
import { SearchResultTool } from "../MapTools/drawMapTools/SearchResultTool";
import type { RouteVehicleType } from "@/types/search";

type EndpointKey = "start" | "end";


interface TipOption {
  label: string
  value: string
  lngLat: [number, number]
}

const searchStore = useSearchPanelStore();
const { routePlanOpen, routeForm, routePlanning, canPlan } = storeToRefs(searchStore);
const { currentMap: MapInstance } = useCurrentMap();

let resultTool: SearchResultTool | null = null;
let pickKey: EventsKey | null = null;
let pickTarget: EndpointKey | null = null;

/** MapStore 的 map 初值是空对象，必须确认拿到真实 OL Map 后再建层 */
const ensureTool = () => {
  const map = MapInstance.value;
  if (!isOlMap(map)) return null;
  if (resultTool && resultTool.getMap() !== map) {
    // 路由切换换了地图实例，旧工具持有的图层已失效，需重建
    resultTool.destroy();
    resultTool = null;
  }
  if (!resultTool) resultTool = new SearchResultTool({ map });
  return resultTool;
};

const formatDistance = (meters: number) =>
  meters >= 1000 ? `${(meters / 1000).toFixed(2)} 公里` : `${Math.round(meters)} 米`;

const routeSummary = ref<{ distance: number; duration: number } | null>(null);

// ===== 地址模糊检索（el-autocomplete 数据源） =====
const tipsCache = ref<Record<string, TipOption[]>>({});

const queryTips = async (keyword: string, callback: (items: AutocompleteData) => void) => {
  const text = keyword.trim();
  if (!text) return callback([]);
  const cached = tipsCache.value[text];
  if (cached) return callback(cached as unknown as AutocompleteData);
  try {
    const response = (await amapApi.inputTips({ keywords: text })) as PoiFeatureCollection | undefined;
    const features = Array.isArray(response?.features) ? response.features : [];
    const items: TipOption[] = features
      .map((feature: PoiFeature) => {
        const props = feature?.properties;
        const coords = feature?.geometry?.coordinates;
        if (!props || !Array.isArray(coords)) return null;
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
        const label = [props.name, props.district, props.address].filter(Boolean).join(" ");
        return { label, value: label, lngLat: [lng, lat] as [number, number] };
      })
      .filter((item): item is TipOption => item !== null);
    tipsCache.value[text] = items;
    callback(items as unknown as AutocompleteData)
  } catch (error) {
    console.warn("[routePlanPanel] inputTips failed:", error);
    callback([]);
  }
};

/** 选中候选项：高德返回已是 WGS84，直接用 */
/** el-autocomplete 的 fetch-suggestions 适配器：模板内联箭头函数无法收敛类型 */
const onFetchTips: AutocompleteFetchSuggestions = (keyword, callback) => {
  void queryTips(keyword, callback);
};

const onSelectTip = (which: EndpointKey, option: TipOption) => {
  searchStore.setRouteEndpoint(which, option.value, option.lngLat);
};

/** 输入框文本变化时，若与已选坐标不一致则清空坐标（文本必须与选点绑定） */
const onInputChange = (which: EndpointKey, text: string) => {
  const current = routeForm.value[which];
  if (current.text !== text && current.lngLat) {
    searchStore.setRouteEndpoint(which, text, null);
  }
};

// ===== 地图选点 =====
const onPickOnMap = (which: EndpointKey) => {
  const map = MapInstance.value;
  const tool = ensureTool();
  if (!map || !tool) return;
  pickTarget = which;
  if (pickKey) unByKey(pickKey);
  ElMessage.info(`请在地图上点击选择${which === "start" ? "起点" : "终点"}`);

  pickKey = map.on("singleclick", (event: { coordinate?: number[] }) => {
    const coordinate = event.coordinate;
    if (!coordinate || pickTarget !== which) return;
    const [lng, lat] = toLonLat(coordinate) as [number, number];
    const wgs84 = amapGcj02ToWgs84([lng, lat]);
    searchStore.setRouteEndpoint(which, `${wgs84[0].toFixed(6)},${wgs84[1].toFixed(6)}`, wgs84);
    // 关闭地图选点监听
    if (pickKey) unByKey(pickKey);
    pickKey = null;
    pickTarget = null;
    void fetchReverseName(which, wgs84);
  });
};

/** 反查地址文本（POI 类接口返回已是 WGS84） */
const fetchReverseName = async (which: EndpointKey, wgs84: [number, number]) => {
  // regeo 入参是高德坐标，需反向转换回 GCJ-02
  const gcj02 = toAmapLngLatString(wgs84);
  try {
    const response = await amapApi.regeo({
      location: gcj02,
      extensions: "all",
    });
    const features = (response as PoiFeatureCollection | undefined)?.features;
    const name = features?.[0]?.properties?.name || response?.formatAddress;
    if (name) searchStore.setRouteEndpoint(which, name, wgs84);
  } catch {
    // 反查失败保留坐标文本
  }
};

const onClear = (which: EndpointKey) => {
  searchStore.clearRouteEndpoint(which);
  resultTool?.clearRoute();
  routeSummary.value = null;
};

const onSwitchVehicle = (vehicle: RouteVehicleType) => {
  searchStore.setRouteVehicle(vehicle);
  resultTool?.clearRoute();
  routeSummary.value = null;
};

// ===== 路径规划 =====
const parseRouteFeatures = (response: unknown) => {
  const payload = response as {
    totalDistance?: string | number
    totalTime?: string | number
    features?: { geometry?: { coordinates?: unknown } }[]
  };
  const coords: [number, number][] = [];
  const features = Array.isArray(payload?.features) ? payload.features : [];
  features.forEach((feature) => {
    const raw = feature?.geometry?.coordinates;
    if (!Array.isArray(raw)) return;
    raw.forEach((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return;
      const lng = Number(pair[0]);
      const lat = Number(pair[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        // 路径规划坐标是 GCJ-02，统一转 WGS84 后再上图
        coords.push(amapGcj02ToWgs84([lng, lat]));
      }
    });
  });
  return {
    coords,
    distance: Number(payload?.totalDistance ?? 0),
    duration: Number(payload?.totalTime ?? 0),
  };
};

const planRoute = async () => {
  const { start, end, vehicle, truck } = routeForm.value;
  if (!start.lngLat || !end.lngLat) return;
  const tool = ensureTool();
  if (!tool) return;

  searchStore.setRoutePlanning(true);
  tool.clearRoute();
  try {
    // 传入高德的是 GCJ-02，需由 WGS84 反向转换
    const origin = toAmapLngLatString(start.lngLat);
    const destination = toAmapLngLatString(end.lngLat);

    const response =
      vehicle === "truck"
        ? await amapApi.drivingV2({
            origin,
            destination,
            walk: false,
            load: truck.load,
            height: truck.height,
            width: truck.width,
          })
        : await amapApi.driving({ origin, destination, strategy: 0 });

    const { coords, distance, duration } = parseRouteFeatures(response);
    if (!coords.length) {
      ElMessage.warning("未找到可用路径");
      routeSummary.value = null;
      return;
    }
    tool.showRoute(coords);
    tool.showRouteEndpoints(start.lngLat, end.lngLat);
    routeSummary.value = { distance, duration };
  } catch (error) {
    console.warn("[routePlanPanel] planRoute failed:", error);
    ElMessage.error("路径规划失败，请稍后重试");
  } finally {
    searchStore.setRoutePlanning(false);
  }
};

const onAnalyze = () => {
  void planRoute();
};

const onClose = () => {
  searchStore.closeRoutePanel();
  resultTool?.clearRoute();
  routeSummary.value = null;
};

/** 起终点或车型变化时：小汽车实时重算，货车等点分析 */
watch(
  () => [routeForm.value.start.lngLat, routeForm.value.end.lngLat, routeForm.value.vehicle] as const,
  () => {
    if (!routePlanOpen.value) return;
    if (!canPlan.value) {
      resultTool?.clearRoute();
      routeSummary.value = null;
      return;
    }
    if (routeForm.value.manualTrigger) return;
    void planRoute();
  },
  { deep: true },
);

// 打开面板时回填历史记忆
watch(routePlanOpen, (open) => {
  if (open) searchStore.hydrateRouteHistory();
});

onMounted(() => {
  // 预热工具实例，避免首次点击时创建；地图尚未就绪时由 watch 兜底
  if (ensureTool()) return;
  const stop = watch(
    MapInstance,
    (map) => {
      if (!isOlMap(map)) return;
      stop();
      ensureTool();
    },
    { immediate: true },
  );
});

onBeforeUnmount(() => {
  if (pickKey) unByKey(pickKey);
  pickKey = null;
  // 面板卸载即释放图层，避免地图上残留路径线与聚焦特效
  resultTool?.destroy();
  resultTool = null;
});
</script>

<template>
  <div v-if="routePlanOpen" class="route-plan-panel">
    <div class="rp-header">
      <span class="rp-title">路径规划</span>
      <span class="rp-close" role="img" tabindex="-1" @click="onClose">
        <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
          <use xlink:href="#icon-close"></use>
        </svg>
      </span>
    </div>

    <el-tabs
      :model-value="routeForm.vehicle"
      class="rp-tabs"
      @tab-change="(n: string | number) => n === 'truck' || n === 'car' ? onSwitchVehicle(n) : undefined"
    >
      <el-tab-pane label="小汽车" name="car" />
      <el-tab-pane label="货车" name="truck" />
    </el-tabs>

    <div class="rp-body">
      <div class="rp-field">
        <label class="rp-label">起点</label>
        <el-autocomplete
          :model-value="routeForm.start.text"
          class="rp-input"
          placeholder="输入地址或点击右侧选点"
          clearable
          :fetch-suggestions="onFetchTips"
          @select="(o) => onSelectTip('start', o as TipOption)"
          @input="(v) => onInputChange('start', String(v))"
        >
          <template #suffix>
          <span class="rp-field-actions">
            <span class="rp-action" title="清除" @click.stop="onClear('start')">
              <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
                <use xlink:href="#icon-close"></use>
              </svg>
            </span>
            <span class="rp-action" title="地图选点" @click.stop="onPickOnMap('start')">
              <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
                <use xlink:href="#icon-location"></use>
              </svg>
            </span>
          </span>
          </template>
        </el-autocomplete>
      </div>

      <div class="rp-field">
        <label class="rp-label">终点</label>
        <el-autocomplete
          :model-value="routeForm.end.text"
          class="rp-input"
          placeholder="输入地址或点击右侧选点"
          clearable
          :fetch-suggestions="onFetchTips"
          @select="(o) => onSelectTip('end', o as TipOption)"
          @input="(v) => onInputChange('end', String(v))"
        >
          <template #suffix>
          <span class="rp-field-actions">
            <span class="rp-action" title="清除" @click.stop="onClear('end')">
              <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
                <use xlink:href="#icon-close"></use>
              </svg>
            </span>
            <span class="rp-action" title="地图选点" @click.stop="onPickOnMap('end')">
              <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
                <use xlink:href="#icon-location"></use>
              </svg>
            </span>
          </span>
          </template>
        </el-autocomplete>
      </div>

      <template v-if="routeForm.vehicle === 'truck'">
        <div class="rp-truck-grid">
          <div class="rp-field">
            <label class="rp-label">载重(t)</label>
            <el-input
              :model-value="routeForm.truck.load"
              placeholder="载重"
              @update:modelValue="(v: string) => searchStore.setTruckConstraint('load', v)"
            />
          </div>
          <div class="rp-field">
            <label class="rp-label">限高(m)</label>
            <el-input
              :model-value="routeForm.truck.height"
              placeholder="限高"
              @update:modelValue="(v: string) => searchStore.setTruckConstraint('height', v)"
            />
          </div>
          <div class="rp-field">
            <label class="rp-label">限宽(m)</label>
            <el-input
              :model-value="routeForm.truck.width"
              placeholder="限宽"
              @update:modelValue="(v: string) => searchStore.setTruckConstraint('width', v)"
            />
          </div>
        </div>
      </template>

      <div v-if="routeSummary" class="rp-summary">
        <span>距离 {{ formatDistance(routeSummary.distance) }}</span>
        <span>耗时 {{ Math.round(routeSummary.duration / 60) }} 分钟</span>
      </div>

      <div class="rp-actions">
        <el-button
          type="primary"
          class="rp-analyze-btn"
          :loading="routePlanning"
          :disabled="!canPlan"
          @click="onAnalyze"
        >
          {{ routeForm.vehicle === 'truck' ? '分析' : '规划' }}
        </el-button>
      </div>
    </div>
  </div>
</template>


<style scoped lang="less">
.route-plan-panel {
  position: absolute;
  left: 16px;
  top: 16px;
  width: 360px;
  z-index: 8;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: var(--panel-shadow);
  color: var(--text-primary);
  font-size: 13px;
  overflow: hidden;
}

.rp-header {
  background: var(--header-bg);
  color: var(--header-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 40px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rp-title { letter-spacing: 1px; }
.rp-close { cursor: pointer; font-size: 16px; color: var(--header-text); }

.rp-tabs {
  padding: 0 8px;
}

.rp-body {
  padding: 10px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rp-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rp-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.rp-input {
  width: 100%;
}

.rp-field-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
}

.rp-action {
  cursor: pointer;
  color: var(--text-secondary);

  &:hover {
    color: var(--accent-cyan);
  }
}

.rp-truck-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.rp-summary {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
  background: rgba(39, 210, 255, 0.08);
  border-radius: 6px;
  font-size: 13px;
}

.rp-actions {
  display: flex;
  justify-content: flex-end;
}

.rp-analyze-btn {
  width: 100%;
}
</style>
