<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";
import type { AutocompleteData, AutocompleteFetchSuggestions } from "element-plus";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import { toLonLat } from "ol/proj";
import { isOlMap } from "@/utils/mapTool";


import { amapApi, type PoiFeature, type PoiFeatureCollection } from "@/apis/amap";
import { useSearchPanelStore } from "@/store/useSearchPanelStore";
import { useCurrentMap } from "@/composables/useCurrentMap";
import { appEnv } from "@/config/env";
import { SearchResultTool } from "../MapTools/drawMapTools/SearchResultTool";
import type { RouteVehicleType } from "@/types/search";
import { createRouteContinuityWorker } from "@/hooks/useRouteContinuityWorker";
import { buildRoutePlanOptions, ROUTE_OPTION_LABELS } from "@/baseComponent/tools/routePlanOptions";
import { summarizeTmc } from "@/baseComponent/amap/routeCongestion";
import type { RoutePlanOption, RouteStepInstruction } from "@/types/routeAnalysis";

type EndpointKey = "start" | "end";

interface TipOption {
  label: string
  value: string
  lngLat: [number, number]
}

const searchStore = useSearchPanelStore();
const { routePlanOpen, routePanelCollapsed, routeForm, routePlanning, canPlan } = storeToRefs(searchStore);
const { currentMap: MapInstance } = useCurrentMap();

let resultTool: SearchResultTool | null = null;
let pickKey: EventsKey | null = null;
let pickTarget: EndpointKey | null = null;
// 路段衔接 Worker：组件卸载时释放
const continuityWorker = createRouteContinuityWorker();

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

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`;
};

// 高德拥堵状态文案：畅通 / 缓行 / 拥堵 / 严重拥堵（路况图例暂未启用，保留待恢复）
// const congestionLabel = (status: string | number) => {
//   switch (String(status).trim()) {
//     case "1": return "畅通";
//     case "2": return "缓行";
//     case "3": return "拥堵";
//     case "4":
//     case "5": return "严重拥堵";
//     default: break;
//   }
//   const key = String(status ?? "").trim().toUpperCase();
//   if (key.includes("严重") || key.includes("极度") || key.includes("SEVERE")) return "严重拥堵";
//   if (key.includes("拥堵") || key.includes("CONGEST")) return "拥堵";
//   if (key.includes("缓行") || key.includes("SLOW")) return "缓行";
//   if (key.includes("畅通") || key.includes("SMOOTH")) return "畅通";
//   return "未知";
// };

// const congestionLegendColor = (status: string | number) => {
//   switch (String(status).trim()) {
//     case "1": return "#3BA55D";
//     case "2": return "#F2C744";
//     case "3": return "#F08A24";
//     case "4":
//     case "5": return "#E64545";
//     default: break;
//   }
//   const key = String(status ?? "").trim().toUpperCase();
//   if (key.includes("严重") || key.includes("极度") || key.includes("SEVERE")) return "#E64545";
//   if (key.includes("拥堵") || key.includes("CONGEST")) return "#F08A24";
//   if (key.includes("缓行") || key.includes("SLOW")) return "#F2C744";
//   if (key.includes("畅通") || key.includes("SMOOTH")) return "#3BA55D";
//   return "#8A97A6";
// };

/** 顶部汇总行（距离 / 耗时）；逐方案指标在多方案卡片内展示。 */
const routeSummary = ref<{ distance: number; duration: number } | null>(null);

/** 多方案结果：每个方案含距离 / 耗时 / 红绿灯 / 路况 / 转向指引。 */
const routeOptions = ref<RoutePlanOption[]>([]);
/** 选中的方案序号（默认首个，即代理推荐方案）。 */
const selectedOptionIndex = ref(0);
/** 方案卡片展开状态：默认收起该方案的次栏与指引区。 */
const optionExpanded = ref<Record<string, boolean>>({});
/** 路况分布默认收起，展开后显示各等级占比条。 */
const tmcExpanded = ref<Record<string, boolean>>({});

/** 方案是否处于选中态。 */
const isOptionSelected = (option: RoutePlanOption) => option.index === selectedOptionIndex.value;

/** 方案的次栏（距离 / 耗时 / 红绿灯）是否展开。 */
const isOptionExpanded = (option: RoutePlanOption) => optionExpanded.value[option.id] ?? false;

/** 方案的路况分布是否展开。 */
const isTmcExpanded = (option: RoutePlanOption) => tmcExpanded.value[option.id] ?? false;

/** 转向类型 → sprite 图标 id（sprite 中掉头图标名为 icon-turn-around）。 */
const turnIconId = (turn: string): string =>
  turn === "uturn" ? "icon-turn-around" : `icon-turn-${turn}`;

/** 当前高亮的转向指引（按「方案 id + 指引下标」记录）。 */
const activeStep = ref<{ optionId: string; stepIndex: number } | null>(null);

/** 某条指引是否处于高亮态。 */
const isStepActive = (option: RoutePlanOption, step: RouteStepInstruction): boolean =>
  activeStep.value?.optionId === option.id && activeStep.value?.stepIndex === option.steps.indexOf(step);

/**
 * 点击转向指引：定位到该路段并高亮。
 * 切换方案时清掉高亮，避免高亮落在别的方案的路线上。
 */
const onSelectStep = (option: RoutePlanOption, step: RouteStepInstruction) => {
  const tool = ensureTool();
  if (!tool || !step.coords.length) return;
  activeStep.value = { optionId: option.id, stepIndex: option.steps.indexOf(step) };
  tool.focusRouteSegment(step.coords);
};

/** 百分比展示（0~1 → 百分比文本） */
const formatRatio = (ratio: number): string => `${Math.round((Number.isFinite(ratio) ? ratio : 0) * 100)}%`;

/** Input box display state: only synchronized to the store on selection / map pick / clear */
const endpointInput = reactive<Record<EndpointKey, string>>({
  start: "",
  end: "",
});

// ===== 地址模糊检索（el-autocomplete 数据源） =====
const tipsCache = ref<Record<string, TipOption[]>>({});
const tipCoordinateIndex = new Map<string, [number, number]>();

const queryTips = async (keyword: string, callback: (items: AutocompleteData) => void) => {
  const text = keyword.trim();
  if (!text) return callback([]);
  const cached = tipsCache.value[text];
  if (cached) return callback(cached as unknown as AutocompleteData);
  try {
    const response = (await amapApi.inputTips({ keywords: text, city: appEnv.amapAdcode, cityLimit: true })) as PoiFeatureCollection | undefined;
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
    items.forEach((item) => tipCoordinateIndex.set(item.value, item.lngLat));
    tipsCache.value[text] = items;
    callback(items as unknown as AutocompleteData)
  } catch (error) {
    console.warn("[routePlanPanel] inputTips failed:", error);
    callback([]);
  }
};

/** el-autocomplete 的 fetch-suggestions 适配器：模板内联箭头函数无法收敛类型 */
const onFetchTips: AutocompleteFetchSuggestions = (keyword, callback) => {
  void queryTips(keyword, callback);
};

/**
 * 端点变化时立即上图并调整视口：
 * - 选中起点：移动到该点（与地图选点一致）
 * - 选中终点：把起终点一起 fit 进视口，再触发路径规划查询
 */
const syncEndpointMarkers = () => {
  const tool = ensureTool();
  if (!tool) { console.warn("[routePlanPanel] ensureTool 失败：地图实例未就绪"); return; }
  const { start, end } = routeForm.value;
  tool.showRouteEndpoints(start.lngLat, end.lngLat);
  if (start.lngLat && !end.lngLat) {
    tool.fitPoints([start.lngLat]);
  } else if (start.lngLat && end.lngLat) {
    tool.fitPoints([start.lngLat, end.lngLat]);
  }
};

/** 选中下拉项后，Element Plus 会先派发 @input("")，用它忽略这一次回清 */
const suppressInputClear = reactive<Record<EndpointKey, boolean>>({
  start: false,
  end: false,
});

/** 聚焦输入框时按当前端点坐标二次定位地图（起点/终点均可单独回看） */
const onEndpointFocus = (which: EndpointKey) => {
  const lngLat = routeForm.value[which].lngLat;
  if (!lngLat) return;
  const tool = ensureTool();
  if (!tool) return;
  const other = which === "start" ? routeForm.value.end.lngLat : routeForm.value.start.lngLat;
  tool.fitPoints(other ? [lngLat, other] : [lngLat]);
};

/** Element Plus 可能重写 value，用 label 兜底查找坐标 */
const findTipCoords = (text: string): [number, number] | null => {
  const direct = tipCoordinateIndex.get(text);
  if (direct) return direct;
  for (const [value, coords] of tipCoordinateIndex.entries()) {
    if (value.startsWith(text) || text.startsWith(value)) return coords;
  }
  return null;
};

/** Element Plus @select 不触发时，用 @change + 当前文本兜底确认坐标 */
const onAutocompleteChange = (which: EndpointKey) => {
  const text = String(endpointInput[which] ?? "").trim();
  if (!text) return;
  const lngLat = tipCoordinateIndex.get(text) ?? findTipCoords(text);
  if (!lngLat) return;
  searchStore.setRouteEndpoint(which, text, lngLat);
  syncEndpointMarkers();
};

const onSelectTip = (which: EndpointKey, option: TipOption) => {
  const text = String(option?.value ?? "").trim();
  const lngLat = tipCoordinateIndex.get(text) ?? option?.lngLat ?? findTipCoords(text);
  if (!text || !lngLat) return;
  suppressInputClear[which] = true;
  endpointInput[which] = text;
  searchStore.setRouteEndpoint(which, text, lngLat);
  syncEndpointMarkers();
};


// ===== 地图选点 =====
/** 切换地图拾取态鼠标样式：对齐 nav_pick 的 crosshair 拾取交互，拾取完成或取消后恢复 */
const setPickCursor = (map: unknown, cursor: string) => {
  const targetEl = (map as { getTargetElement?: () => HTMLElement | null })?.getTargetElement?.();
  if (targetEl) targetEl.style.cursor = cursor;
};

const onPickOnMap = (which: EndpointKey) => {
  const map = MapInstance.value;
  const tool = ensureTool();
  if (!isOlMap(map) || !tool) {
    ElMessage.warning("地图尚未就绪，请稍后重试");
    return;
  }
  if (pickKey) unByKey(pickKey);
  pickTarget = which;
  // 与 nav_pick 一致：不弹提示，拾取态只把地图鼠标换成十字准星
  setPickCursor(map, "crosshair");

  const handlePick = (event: { coordinate?: number[] }) => {
    if (pickTarget !== which) return;
    const coordinate = event.coordinate;
    if (!coordinate) return;
    // 地图内部统一 WGS84：toLonLat 结果已是 WGS84，不能再按 GCJ-02 反向转换
    const wgs84 = toLonLat(coordinate) as [number, number];
    const text = `${wgs84[0].toFixed(6)},${wgs84[1].toFixed(6)}`;
    endpointInput[which] = text;
    searchStore.setRouteEndpoint(which, text, wgs84);
    syncEndpointMarkers();
    if (pickKey) unByKey(pickKey);
    pickKey = null;
    pickTarget = null;
    setPickCursor(map, "");
    void fetchReverseName(which, wgs84);
  };

  pickKey = map.once("singleclick", handlePick);
};

/** 反查地址文本（接口入参与回包统一 WGS84，无需坐标转换） */
const fetchReverseName = async (which: EndpointKey, wgs84: [number, number]) => {
  const location = `${wgs84[0].toFixed(6)},${wgs84[1].toFixed(6)}`;
  try {
    const response = await amapApi.regeo({
      location,
      extensions: "all",
    });
    const features = (response as PoiFeatureCollection | undefined)?.features;
    const name = features?.[0]?.properties?.name || response?.formatAddress;
    if (name) {
      endpointInput[which] = name;
      searchStore.setRouteEndpoint(which, name, wgs84);
    }
  } catch {
    // 反查失败保留坐标文本
  }
};

const onClear = (which: EndpointKey) => {
  searchStore.clearRouteEndpoint(which);
  endpointInput[which] = "";
  // Requirement 4: clearing either endpoint removes the route line and that endpoint marker;
  resultTool?.clearRoute();
  resultTool?.showRouteEndpoints(routeForm.value.start.lngLat, routeForm.value.end.lngLat);
  routeSummary.value = null;
  routeOptions.value = [];
  activeStep.value = null;
};

const onSwitchVehicle = (vehicle: RouteVehicleType) => {
  searchStore.setRouteVehicle(vehicle);
  resultTool?.clearRoute();
  routeSummary.value = null;
  routeOptions.value = [];
  activeStep.value = null;
};


const planRoute = async () => {
  const { start, end, vehicle, truck } = routeForm.value;
  if (!start.lngLat || !end.lngLat) return;
  const tool = ensureTool();
  if (!tool) return;

  searchStore.setRoutePlanning(true);
  try {
    // 接口入参统一 WGS84，无需转换
    const origin = `${start.lngLat[0].toFixed(6)},${start.lngLat[1].toFixed(6)}`;
    const destination = `${end.lngLat[0].toFixed(6)},${end.lngLat[1].toFixed(6)}`;

    // 小汽车走 strategy=11 返回多方案；货车走 v2 接口，代理端当前恒返回单方案。
    const response =
      vehicle === "truck"
        ? await amapApi.drivingV2({
            origin,
            destination,
            walk: false,
            load: truck.load,
            height: truck.height,
            width: truck.width,
            strategy: 11,
          })
        : await amapApi.driving({ origin, destination, strategy: 11, extensions: "all" });

    const options = buildRoutePlanOptions(response, (tmcs, totalDistanceMeters, durationSeconds) =>
      summarizeTmc(tmcs, { totalDistanceMeters, durationSeconds }),
    );
    if (!options.length) {
      ElMessage.warning("未找到可用路径");
      routeSummary.value = null;
      routeOptions.value = [];
      activeStep.value = null;
      return;
    }

    // P06：各方案的路况几何补齐，保证相邻段无缺口
    const prepared: RoutePlanOption[] = [];
    for (const option of options) {
      const continuous = await continuityWorker.ensureContinuity(option.tmcs);
      prepared.push({
        ...option,
        tmcs: continuous.map((segment) => ({ status: segment.status, polyline: segment.polyline })),
      });
    }

    routeOptions.value = prepared;
    activeStep.value = null;
    selectedOptionIndex.value = 0;
    optionExpanded.value = {};
    tmcExpanded.value = {};
    const selected = prepared[0];
    tool.showRouteOptions(prepared, 0);
    tool.fitPoints(selected.coords);
    routeSummary.value = {
      distance: selected.distanceMeters,
      duration: selected.durationSeconds,
    };
  } catch (error) {
    console.warn("[routePlanPanel] planRoute failed:", error);
    ElMessage.error("路径规划失败，请稍后重试");
  } finally {
    searchStore.setRoutePlanning(false);
  }
};

/** 选中方案：切换上图路线并重新 fit 到该方案范围。 */
const onSelectOption = (option: RoutePlanOption) => {
  const tool = ensureTool();
  if (!tool) return;
  selectedOptionIndex.value = option.index;
  // 切换方案后原高亮路段已不在当前路线上，清掉高亮状态
  activeStep.value = null;
  tool.clearFocus();
  tool.showRouteOptions(routeOptions.value, option.index);
  tool.fitPoints(option.coords);
};

/** 折叠 / 展开某方案的次栏与指引区。 */
const onToggleOption = (option: RoutePlanOption) => {
  optionExpanded.value = { ...optionExpanded.value, [option.id]: !isOptionExpanded(option) };
};

/** 折叠 / 展开某方案的路况分布。 */
const onToggleTmc = (option: RoutePlanOption) => {
  tmcExpanded.value = { ...tmcExpanded.value, [option.id]: !isTmcExpanded(option) };
};

const onClose = () => {
  searchStore.closeRoutePanel();
  resultTool?.clearRoute();
  routeSummary.value = null;
  routeOptions.value = [];
  activeStep.value = null;
};
const onAnalyze = () => {
/** 手动触发路径规划分析（小汽车 / 货车统一入口） */
  void planRoute();
};

const onToggleFold = () => {
  searchStore.toggleRoutePanelCollapse();
};

/**
 * 起终点或车型变化时：端点立即上图 + 清空旧路径结果，等待用户点击分析
 * 注意：clearRoute() 会同时清掉端点图层，所以必须在其后重新 syncEndpointMarkers()
 */
watch(
  () => [routeForm.value.start.lngLat, routeForm.value.end.lngLat, routeForm.value.vehicle] as const,
  () => {
    if (!routePlanOpen.value) return;
    const tool = ensureTool();
    if (!tool) return;
    // 清掉旧路径线与旧端点图标，再按当前表单重新上图
    tool.clearRoute();
    tool.showRouteEndpoints(routeForm.value.start.lngLat, routeForm.value.end.lngLat);
    // 视野联动：只选起点时移到起点；起终点都有时一起 fit
    const { start, end } = routeForm.value;
    if (start.lngLat && !end.lngLat) {
      tool.fitPoints([start.lngLat]);
    } else if (start.lngLat && end.lngLat) {
      tool.fitPoints([start.lngLat, end.lngLat]);
    }
    routeSummary.value = null;
    routeOptions.value = [];
    activeStep.value = null;
  },
  { deep: true },
);

// 打开面板时回填历史记忆
watch(routePlanOpen, (open) => {
  if (!open) return;
  searchStore.hydrateRouteHistory();
  endpointInput.start = routeForm.value.start.text ?? "";
  endpointInput.end = routeForm.value.end.text ?? "";
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
  continuityWorker.destroy();
  if (pickKey) unByKey(pickKey);
  pickKey = null;
  if (pickTarget && isOlMap(MapInstance.value)) setPickCursor(MapInstance.value, "");
  // 面板卸载即释放图层，避免地图上残留路径线与聚焦特效
  resultTool?.destroy();
  resultTool = null;
});
</script>

<template>
  <div v-if="routePlanOpen" class="route-plan-panel themed-panel">
    <div class="rp-header">
      <span class="rp-title">路径规划</span>
      <span class="rp-hdr-actions">
        <span
          class="rp-fold"
          role="img"
          tabindex="-1"
          :title="routePanelCollapsed ? '展开' : '折叠'"
          @click="onToggleFold"
        >
          <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
            <use :xlink:href="routePanelCollapsed ? '#icon-unfold' : '#icon-closes'"></use>
          </svg>
        </span>
        <span class="rp-close" role="img" tabindex="-1" title="关闭" @click="onClose">
          <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
            <use xlink:href="#icon-close"></use>
          </svg>
        </span>
      </span>
    </div>

    <template v-if="!routePanelCollapsed">
      <el-tabs
        v-model="routeForm.vehicle"
        class="rp-tabs"
        @tab-change="(n: string | number) => n === 'truck' || n === 'car' ? onSwitchVehicle(n) : undefined"
      >
        <el-tab-pane label="小汽车" name="car" />
        <el-tab-pane label="货车" name="truck" />
      </el-tabs>

      <div class="rp-body">
        <div class="rp-field rp-field-row">
          <label class="rp-label">起点</label>
          <div class="rp-input-wrap">
            <el-autocomplete
              v-model="endpointInput.start"
              class="rp-input"
              placeholder="输入地址或点击右侧选点"
              :show-clear="false"
              :fetch-suggestions="onFetchTips"
              :trigger-on-focus="false"
              @focus="() => onEndpointFocus('start')"
              @select="(o) => onSelectTip('start', o as TipOption)"
              @change="() => onAutocompleteChange('start')"
            />
            <span class="rp-action" title="清除" @click="onClear('start')">
              <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
                <use xlink:href="#icon-close"></use>
              </svg>
            </span>
            <span class="rp-action rp-action-start" title="地图选点" @click="onPickOnMap('start')">
              <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
                <use xlink:href="#icon-location"></use>
              </svg>
            </span>
          </div>
        </div>

        <div class="rp-field rp-field-row">
          <label class="rp-label">终点</label>
          <div class="rp-input-wrap">
            <el-autocomplete
              v-model="endpointInput.end"
              class="rp-input"
              placeholder="输入地址或点击右侧选点"
              :show-clear="false"
              :fetch-suggestions="onFetchTips"
              :trigger-on-focus="false"
              @focus="() => onEndpointFocus('end')"
              @select="(o) => onSelectTip('end', o as TipOption)"
              @change="() => onAutocompleteChange('end')"
            />
            <span class="rp-action" title="清除" @click="onClear('end')">
              <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
                <use xlink:href="#icon-close"></use>
              </svg>
            </span>
            <span class="rp-action rp-action-end" title="地图选点" @click="onPickOnMap('end')">
              <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
                <use xlink:href="#icon-location"></use>
              </svg>
            </span>
          </div>
        </div>

        <template v-if="routeForm.vehicle === 'truck'">
          <div class="rp-truck-grid">
            <div class="rp-field">
              <label class="rp-label">载重(t)</label>
              <el-input
                :model-value="routeForm.truck.load"
                placeholder="载重"
                @update:modelValue="(v) => searchStore.setTruckConstraint('load', String(v))"
              />
            </div>
            <div class="rp-field">
              <label class="rp-label">限高(m)</label>
              <el-input
                :model-value="routeForm.truck.height"
                placeholder="限高"
                @update:modelValue="(v) => searchStore.setTruckConstraint('height', String(v))"
              />
            </div>
            <div class="rp-field">
              <label class="rp-label">限宽(m)</label>
              <el-input
                :model-value="routeForm.truck.width"
                placeholder="限宽"
                @update:modelValue="(v) => searchStore.setTruckConstraint('width', String(v))"
              />
            </div>
          </div>
          <div class="rp-hint">货车条件需填写后点击分析</div>
        </template>

        <div v-if="routeSummary" class="rp-summary">
          <span>距离 {{ formatDistance(routeSummary.distance) }}</span>
          <span>耗时 {{ Math.round(routeSummary.duration / 60) }} 分钟</span>
        </div>

        <!-- 需求 1 / 5：小汽车与货车统一手动点击分析，分析结果在面板展示 -->
        <div class="rp-actions">
          <el-button
            type="primary"
            class="rp-analyze-btn"
            :loading="routePlanning"
            :disabled="!canPlan"
            @click="onAnalyze"
          >
            分析
          </el-button>
        </div>

        <!-- 多方案结果：每套方案一张卡片，可点击切换上图 -->
        <div v-if="routeOptions.length" class="rp-options">
          <div
            v-for="option in routeOptions"
            :key="option.id"
            :class="['rp-option', { selected: isOptionSelected(option) }]"
          >
            <!-- 顶栏：方案序号 + 档位标签 + 折叠箭头 -->
            <div class="rp-option-head" @click="onSelectOption(option)">
              <span class="rp-option-index">方案{{ option.index + 1 }}</span>
              <span class="rp-option-tags">
                <span
                  v-for="tier in option.tiers"
                  :key="tier"
                  :class="['rp-option-tag', `tag-${tier}`]"
                >{{ ROUTE_OPTION_LABELS[tier] }}</span>
                <span v-if="!option.tiers.length" class="rp-option-tag tag-alternative">备选方案</span>
              </span>
              <span
                class="rp-option-fold"
                role="img"
                tabindex="-1"
                :title="isOptionExpanded(option) ? '收起' : '展开'"
                @click.stop="onToggleOption(option)"
              >
                <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
                  <use :xlink:href="isOptionExpanded(option) ? '#icon-closes' : '#icon-unfold'"></use>
                </svg>
              </span>
            </div>

            <!-- 次栏：约 X 分钟 | X 公里 | 红绿灯 N 个 -->
            <div class="rp-option-meta">
              <span>约{{ Math.round(option.durationSeconds / 60) }}分钟</span>
              <span class="rp-option-sep">|</span>
              <span>{{ formatDistance(option.distanceMeters) }}</span>
              <span class="rp-option-sep">|</span>
              <span class="rp-option-lights">红绿灯{{ option.trafficLights }}个</span>
            </div>

            <!-- 展开区：指标 + 路况分布 + 转向指引 -->
            <div v-if="isOptionExpanded(option)" class="rp-option-body">
              <div class="rp-option-grid">
                <div class="rp-option-item">
                  <span class="rp-option-label">距离</span>
                  <span class="rp-option-value">{{ formatDistance(option.distanceMeters) }}</span>
                </div>
                <div class="rp-option-item">
                  <span class="rp-option-label">预计耗时</span>
                  <span class="rp-option-value">{{ formatDuration(option.durationSeconds) }}</span>
                </div>
                <div class="rp-option-item">
                  <span class="rp-option-label">红绿灯</span>
                  <span class="rp-option-value">{{ option.trafficLights }} 个</span>
                </div>
              </div>

              <!-- 路况分布：默认收起，标题行直接给出畅通率 -->
              <div class="rp-tmc">
                <div class="rp-tmc-head" @click="onToggleTmc(option)">
                  <span class="rp-tmc-title">路况分布</span>
                  <span class="rp-tmc-summary">
                    畅通率 {{ option.coverage > 0 ? formatRatio(option.smoothRatio) : '暂无数据' }}
                  </span>
                  <span class="rp-tmc-fold" role="img" tabindex="-1">
                    <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
                      <use :xlink:href="isTmcExpanded(option) ? '#icon-closes' : '#icon-unfold'"></use>
                    </svg>
                  </span>
                </div>
                <div v-if="isTmcExpanded(option)" class="rp-tmc-bars">
                  <div class="rp-tmc-bar">
                    <span class="rp-tmc-label">畅通</span>
                    <el-progress
                      :percentage="Math.round(option.smoothRatio * 100)"
                      :stroke-width="8"
                      :show-text="false"
                      color="var(--tag-success-text)"
                    />
                    <span class="rp-tmc-value">{{ formatRatio(option.smoothRatio) }}</span>
                  </div>
                  <div class="rp-tmc-bar">
                    <span class="rp-tmc-label">缓行</span>
                    <el-progress
                      :percentage="Math.round(option.slowRatio * 100)"
                      :stroke-width="8"
                      :show-text="false"
                      color="var(--tag-warning-text)"
                    />
                    <span class="rp-tmc-value">{{ formatRatio(option.slowRatio) }}</span>
                  </div>
                  <div class="rp-tmc-bar">
                    <span class="rp-tmc-label">拥堵</span>
                    <el-progress
                      :percentage="Math.round(option.jamRatio * 100)"
                      :stroke-width="8"
                      :show-text="false"
                      color="var(--tag-danger-text)"
                    />
                    <span class="rp-tmc-value">{{ formatRatio(option.jamRatio) }}</span>
                  </div>
                  <div class="rp-tmc-foot">
                    覆盖度 {{ formatRatio(option.coverage) }}
                  </div>
                </div>
              </div>

              <!-- 转向指引 -->
              <div v-if="option.steps.length" class="rp-steps">
                <div
                  v-for="(step, stepIdx) in option.steps"
                  :key="stepIdx"
                  :class="['rp-step', { active: isStepActive(option, step) }]"
                  role="button"
                  tabindex="0"
                  title="定位到该路段"
                  @click="onSelectStep(option, step)"
                  @keydown.enter="onSelectStep(option, step)"
                  @keydown.space.prevent="onSelectStep(option, step)"
                >
                  <span class="rp-step-arrow" :class="`turn-${step.turn}`">
                    <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
                      <use :xlink:href="`#${turnIconId(step.turn)}`"></use>
                    </svg>
                  </span>
                  <span class="rp-step-text">{{ step.partDesc }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="!canPlan" class="rp-status">
          <span class="rp-status-text">请选择起点与终点后点击分析</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="less">
.route-plan-panel {
  /* 在 circleQueryPanel 的 flex 容器内流式排列，自动跟随上方检索面板高度；
     flex 可压缩 + min-height:0：与检索面板同时展开受视口限制时，
     由内部 .rp-body 滚动兜底，避免整块被屏幕裁断 */
  position: relative;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: var(--panel-shadow);
  color: var(--text-primary);
  font-size: 13px;
  overflow: hidden;
}

/* 头部 / 车型 tab 固定不参与压缩，只压缩 body 内容区 */
.rp-header,
.rp-tabs {
  flex: 0 0 auto;
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

.rp-hdr-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.rp-fold,
.rp-close {
  cursor: pointer;
  font-size: 16px;
  color: var(--header-text);
  display: inline-flex;
}

.rp-fold:hover,
.rp-close:hover { opacity: 0.75; }

.rp-tabs {
  padding: 0 8px;
  flex: 0 0 auto;
}

.rp-body {
  padding: 10px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 面板高度受限时此处出现内部滚动，表单/结果区完整可达 */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
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

.rp-input-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.rp-input { flex: 1; min-width: 0; }

.rp-field-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
}

.rp-action {
  cursor: pointer;
  color: var(--text-secondary);
  display: inline-flex;

  &:hover { color: var(--accent-cyan); }
}
.rp-action-start {
  color: #3ba55d !important;

  &:hover {
    color: #3ba55d;
    opacity: 0.65;
  }
}

.rp-action-end {
  color: #d81e06 !important;

  &:hover {
    color: #d81e06;
    opacity: 0.65;
  }
}

.rp-truck-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.rp-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.rp-summary {
  display: flex;
  justify-content: space-between;
  padding: 8px 10px;
  background: var(--accent-cyan-soft);
  color: var(--text-primary);
  border-radius: 6px;
  font-size: 13px;
}

.rp-status {
  font-size: 12px;
  min-height: 18px;
}

.rp-status-text { color: var(--text-muted); }
.rp-status-text.ok { color: var(--accent-cyan); }

.rp-actions {
  display: flex;
  justify-content: flex-end;
}

.rp-analyze-btn {
  height: 30px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 13px;
  width: 100%;
}

.rp-result {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 10px 12px;
}

.rp-result-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.rp-result-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.rp-result-elapsed {
  font-size: 12px;
  color: var(--text-secondary);
}

.rp-result-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rp-result-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.rp-result-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.rp-result-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-cyan);
}

.rp-congestion {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--primary-li-bottom-color);
}

.rp-congestion-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.rp-congestion-item {
  font-size: 12px;
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.rp-congestion-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

/* P02 路况分析区 */
.rp-analysis {
  margin-top: var(--space-sm);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--primary-li-bottom-color);
}

.rp-analysis-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-xs);
}

.rp-analysis-title {
  font-size: 12px;
  color: var(--text-secondary);
}

.rp-analysis-coverage {
  font-size: 12px;
  color: var(--text-muted);
}

.rp-analysis-bars {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.rp-analysis-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.rp-analysis-label {
  flex: 0 0 32px;
  font-size: 12px;
  color: var(--text-secondary);
}

.rp-analysis-value {
  flex: 0 0 40px;
  text-align: right;
  font-size: 12px;
  color: var(--text-primary);
}

.rp-analysis-foot {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-xs);
  font-size: 12px;
  color: var(--text-muted);
}

.rp-analysis-segments {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}

.rp-analysis-segment {
  font-size: 12px;
  padding: 0 var(--space-xs);
  border-radius: var(--radius-sm);
  background: var(--tag-info-bg);
}

/* ---------- 多方案结果卡片（按截图：顶栏 tag + 次栏指标 + 转向指引） ---------- */
.rp-options {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-xs);
}

.rp-option {
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-md);
  background: var(--panel-bg-solid);
  overflow: hidden;
}

/* 选中方案用强调色描边，与备选方案区分 */
.rp-option.selected {
  border-color: var(--accent-cyan);
}

.rp-option-head {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 6px 8px;
  cursor: pointer;
  background: var(--header-bg);
}

.rp-option-index {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
}

.rp-option-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}

/* 档位 tag：按档位分色，主档位用强调色 */
.rp-option-tag {
  font-size: 11px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  background: var(--tag-info-bg);
  color: var(--tag-info-text);
}

.rp-option-tag.tag-fastest {
  background: var(--tag-success-bg);
  color: var(--tag-success-text);
}

.rp-option-tag.tag-shortest {
  background: var(--tag-warning-bg);
  color: var(--tag-warning-text);
}

.rp-option-tag.tag-avoidJam {
  background: var(--tag-danger-bg);
  color: var(--tag-danger-text);
}

.rp-option-tag.tag-balanced {
  background: var(--tag-info-bg);
  color: var(--accent-cyan);
}

.rp-option-tag.tag-alternative {
  background: var(--tag-info-bg);
  color: var(--text-muted);
}

.rp-option-fold {
  flex: 0 0 auto;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  display: inline-flex;
}

.rp-option-fold:hover { color: var(--text-primary); }

/* 次栏：约 X 分钟 | X 公里 | 红绿灯 N 个 */
.rp-option-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--panel-border);
}

.rp-option-sep {
  color: var(--text-muted);
}

.rp-option-lights {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.rp-option-body {
  padding: 6px 8px 8px;
}

.rp-option-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-xs);
}

.rp-option-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rp-option-label {
  font-size: 11px;
  color: var(--text-muted);
}

.rp-option-value {
  font-size: 12px;
  color: var(--text-primary);
}

/* 路况分布：默认收起，展开显示占比条 */
.rp-tmc {
  margin-top: var(--space-xs);
  border-top: 1px dashed var(--panel-border);
  padding-top: 4px;
}

.rp-tmc-head {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  cursor: pointer;
}

.rp-tmc-title {
  font-size: 12px;
  color: var(--text-secondary);
}

.rp-tmc-summary {
  flex: 1 1 auto;
  font-size: 12px;
  color: var(--accent-cyan);
}

.rp-tmc-fold {
  font-size: 13px;
  color: var(--text-muted);
  display: inline-flex;
}

.rp-tmc-bars {
  margin-top: 4px;
}

.rp-tmc-bar {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: 3px;
}

.rp-tmc-label {
  flex: 0 0 30px;
  font-size: 12px;
  color: var(--text-muted);
}

.rp-tmc-value {
  flex: 0 0 40px;
  text-align: right;
  font-size: 12px;
  color: var(--text-primary);
}

.rp-tmc-foot {
  font-size: 11px;
  color: var(--text-muted);
  text-align: right;
}

/* 转向指引列表 */
.rp-steps {
  margin-top: var(--space-xs);
  border-top: 1px dashed var(--panel-border);
  padding-top: 4px;
}

.rp-step {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  line-height: 1.6;
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 1px 3px;
  transition: background-color 0.15s ease;
}

.rp-step:hover {
  background: var(--card-border);
}

/* 当前定位中的路段：底色 + 左侧强调条 */
.rp-step.active {
  background: var(--panel-bg-solid);
  box-shadow: inset 2px 0 0 var(--accent-cyan);
}

.rp-step.active .rp-step-text {
  color: var(--accent-cyan);
}

.rp-step-arrow {
  flex: 0 0 auto;
  font-size: 13px;
  color: var(--accent-cyan);
  display: inline-flex;
  align-items: center;
  margin-top: 2px;
}

.rp-step-text {
  flex: 1 1 auto;
  font-size: 12px;
  color: var(--text-primary);
  word-break: break-all;
}
</style>
