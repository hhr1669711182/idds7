<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, computed } from "vue";
import { ElMessage } from "element-plus";
import { storeToRefs } from "pinia";
import { EventBus } from "@/utils/mitt";
import { usePanelStore, useSearchPanelStore } from "@/store";
import {
  ALL_RESOURCE_TYPES,
  type CircleQuerySourceData,
  type CircleQueryPatch,
} from "../MapTools/drawMapTools/CircleQueryTool";
import type { CircleQueryTool } from "../MapTools/drawMapTools/CircleQueryTool";
import { SearchResultTool } from "../MapTools/drawMapTools/SearchResultTool";
import { transform } from "ol/proj";
import { isOlMap } from "@/utils/mapTool";
import { amapApi, type PoiFeature, type RegeoData } from "@/apis/amap";
import { parseCoordinateText } from "@/utils/coordinateText";
import { useCurrentMap } from "@/composables/useCurrentMap";
import type { SearchViewOption } from "@/types/search";
import RoutePlanPanel from "./routePlanPanel.vue";

type AnyTool = CircleQueryTool | any;

const panelStore = usePanelStore();
const searchStore = useSearchPanelStore();
const { currentMap: MapInstance } = useCurrentMap();

const {
  queryText,
  activeTab,
  activeBucket,
  loading,
  searchError,
  selectedItem,
  searchPanelCollapsed,
  searchPanelClosed,
  viewOptions,
} = storeToRefs(searchStore);

// ===== 圈选工具状态（原有逻辑保持不变） =====
const visible = ref(false);
const data = ref<CircleQuerySourceData | null>(null);
let currentTool: AnyTool | null = null;
let resultTool: SearchResultTool | null = null;

const RADIUS_MIN_METERS = 200;
const RADIUS_MAX_METERS = 5000;
const RADIUS_STEP_METERS = 100;

const radiusMeters = ref<number>(RADIUS_MIN_METERS);
const selectedTypes = ref<string[]>(ALL_RESOURCE_TYPES.map((i) => i.key));

const emitPatch = (patch: CircleQueryPatch) => {
  if (!currentTool) return;
  if (typeof currentTool.applyPatch === "function") {
    currentTool.applyPatch(patch);
  }
};

const onSliderChange = (val: any) => {
  const v = Math.round(val);
  if (!v || v < RADIUS_MIN_METERS || v > RADIUS_MAX_METERS) return;
  radiusMeters.value = v;
  if (currentTool) {
    currentTool._radiusMeters = v;
  }
  emitPatch({ radiusMeters: v });
};

const onToggleType = (key: string, checked: boolean) => {
  const cur = new Set(selectedTypes.value);
  if (checked) cur.add(key);
  else cur.delete(key);
  const next = ALL_RESOURCE_TYPES.map((t) => t.key).filter((k) => cur.has(k));
  selectedTypes.value = next;
  emitPatch({ resourceTypes: next });
};

const onToolUpdate = (payload: unknown) => {
  const next = payload as CircleQuerySourceData;
  data.value = next;
  if (next && typeof next.radiusMeters === "number" && next.radiusMeters > 0) {
    radiusMeters.value = Math.round(next.radiusMeters);
  }
  if (next && Array.isArray(next.resourceTypes)) {
    selectedTypes.value = [...next.resourceTypes];
  }
  // 工具在拖拽 / 改半径 / 改类型时高频触发，防抖后再回填列表
  if (next) debouncedSyncCircle(next);
};

const onToolClose = () => {
  visible.value = false;
  data.value = null;
  currentTool = null;
  panelStore.clearCircleQueryTool();
};

/** 需求 10：清空地图上的圈，回到可重新绘制状态（不关闭面板） */
const onClearCircle = () => {
  if (currentTool && typeof currentTool.clearCircle === "function") {
    currentTool.clearCircle();
  }
  resultTool?.clearResources();
  searchStore.clearResults();
};

const viewSelectVisible = ref(false);
const routeIconClicking = ref(false);
const bind = (tool: AnyTool | null) => {
  currentTool = tool;
  if (currentTool && typeof currentTool.getSourceData === "function") {
    const snap = currentTool.getSourceData() as CircleQuerySourceData;
    data.value = snap;
    if (snap && typeof snap.radiusMeters === "number" && snap.radiusMeters > 0) {
      radiusMeters.value = Math.round(snap.radiusMeters);
    }
    if (snap && Array.isArray(snap.resourceTypes)) {
      selectedTypes.value = [...snap.resourceTypes];
    }
  } else {
    data.value = null;
  }
  visible.value = !!currentTool;
  // 圈选查询工具每次激活都执行面板联动：收起路径规划面板 + 展开资源检索面板
  if (visible.value) {
    if (searchStore.routePlanOpen && !searchStore.routePanelCollapsed) {
      searchStore.toggleRoutePanelCollapse();
    }
    searchStore.expandSearchPanel();
    viewSelectVisible.value = false;
  }
};

const stopWatchTool = watch(
  () => panelStore.circleQueryTool,
  (tool) => bind(tool ?? null),
  { immediate: true }
);
// ===== 检索相关 =====

/** MapStore 的 map 初值是空对象，必须确认拿到真实 OL Map 后再建层 */
const ensureResultTool = () => {
  const map = MapInstance.value;
  if (!isOlMap(map)) return null;
  if (resultTool && resultTool.getMap() !== map) {
    // 路由切换换了地图实例，旧工具持有的图层已失效，需重建
    resultTool.destroy();
    resultTool = null;
  }
  if (!resultTool) {
    resultTool = new SearchResultTool({ map });
  }
  return resultTool;
};

/** 圈选检索列表回填：与 WMS 上图共用同一份 DWITHIN 条件，保证图与列表一致 */
const syncCircleResults = async (snapshot: CircleQuerySourceData) => {
  const typeNames = ALL_RESOURCE_TYPES
    .filter((t) => snapshot.resourceTypes.includes(t.key))
    .map((t) => t.layerName);
  if (!typeNames.length || !snapshot.centerLonLat?.[0] || snapshot.radiusMeters <= 0) {
    resultTool?.clearResources();
    return;
  }
  const tool = ensureResultTool();
  const filter = await searchStore.runCircleSearch(
    snapshot.centerLonLat,
    snapshot.radiusMeters,
    typeNames,
  );
  if (!tool || !filter?.typeNames.length) {
    tool?.clearResources();
    return;
  }
  tool.showResources(filter);
};

/** 工具事件高频触发时的轻量防抖（局部实现，不引第三方类型负担） */
let circleSyncTimer: ReturnType<typeof setTimeout> | null = null;
const debouncedSyncCircle = (snapshot: CircleQuerySourceData) => {
  if (circleSyncTimer) clearTimeout(circleSyncTimer);
  circleSyncTimer = setTimeout(() => {
    circleSyncTimer = null;
    void syncCircleResults(snapshot);
  }, 350);
};

/** 当前地图视口（WGS84），用于叠加BBOX约束；与圈选工具同源，走 ol/proj */
const getViewportExtent = (): [number, number, number, number] | undefined => {
  const map = MapInstance.value;
  if (!map) return undefined;
  const extent = map.getView().calculateExtent(map.getSize());
  if (!extent) return undefined;
  const [minX, minY] = transform(extent.slice(0, 2), "EPSG:3857", "EPSG:4326");
  const [maxX, maxY] = transform(extent.slice(2, 4), "EPSG:3857", "EPSG:4326");
  return [minX, minY, maxX, maxY];
};

/**
 * 经纬度文本逆地址解析：只标点上图 + 定位，不触发检索结果、不触发路径规划、不开新面板。
 * 接口入参与出参在本项目内统一 WGS84，无需坐标转换。
 */
const onQueryCoordinate = async (lngLat: [number, number]) => {
  const tool = ensureResultTool();
  if (!tool) return;
  // 收起视图下拉，避免与坐标解析语义冲突
  viewSelectVisible.value = false;
  try {
    const location = `${lngLat[0].toFixed(6)},${lngLat[1].toFixed(6)}`;
    const response = (await amapApi.regeo({
      location,
      extensions: 'all',
    })) as RegeoData | undefined;
    const features = Array.isArray(response?.features) ? response.features : [];
    // POI 点位：regeo 返回即 WGS84，直接上图
    const poiPoints: [number, number][] = [];
    features.forEach((feature: PoiFeature) => {
      const coords = feature?.geometry?.coordinates;
      if (!Array.isArray(coords)) return;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) poiPoints.push([lng, lat]);
    });
    const name = features?.[0]?.properties?.name || response?.formatAddress;
    // 解析出名称时回填输入框，让用户看到反查到的地址
    if (name) queryText.value = String(name);
    tool.clearResources();
    if (poiPoints.length) {
      tool.showAddressPoints(poiPoints);
      tool.focusPoint(lngLat);
    } else {
      // 没有 POI 时至少把输入坐标标出来并定位
      tool.clearFocus();
      tool.focusPoint(lngLat);
    }
  } catch (error) {
    console.warn("[circleQueryPanel] regeo failed:", error);
    ElMessage.error("逆地址解析失败，请稍后重试");
  }
};

const onQuery = async () => {
  const tool = ensureResultTool();
  if (!tool) return;
  // 需求 1：点查询按钮后收起视图下拉
  viewSelectVisible.value = false;
  // 经纬度文本：只走逆地址解析，标点上图 + 定位；不触发检索、不触发路径规划、不展开新面板
  const lngLat = parseCoordinateText(queryText.value);
  if (lngLat) {
    await onQueryCoordinate(lngLat);
    return;
  }
  searchStore.expandSearchPanel();
  // 需求 4：资源检索展开时折叠路径规划面板
  if (searchStore.routePlanOpen && !searchStore.routePanelCollapsed) {
    searchStore.toggleRoutePanelCollapse();
  }
  await searchStore.runKeywordSearch(queryText.value, getViewportExtent());
  const filter = searchStore.activeFilter;
  if (filter.typeNames.length) tool.showResources(filter);
  else tool.clearResources();

  // 地址结果上图（条数很少，前端渲染无压力）
  const addressItems = searchStore.addressResults.items;
  if (addressItems.length) {
    tool.showAddressPoints(addressItems.map((i) => i.lngLat).filter((c): c is [number, number] => !!c));
  } else {
    tool.clearFocus();
  }
};

const onSelectView = async (option: SearchViewOption) => {
  viewSelectVisible.value = false;
  queryText.value = option.name;
  // D6：选中视图配置项即视为发起检索，展开 cq-panel 并切到资源 tab
  searchStore.expandSearchPanel();
  // 视图检索：以视图中文名回填输入框，并按名称同时做文本模糊，地址/资源双源都有数据
  const tool = ensureResultTool();
  if (!tool) return;
  await searchStore.runViewSearch(option.id, option.name);
  const filter = searchStore.activeFilter;
  if (filter.typeNames.length) tool.showResources(filter);
  else tool.clearResources();
  tool.clearFocus();
};

const onTabChange = (name: string | number) => {
  if (name !== "address" && name !== "resource") return;
  searchStore.switchTab(name);
  const tool = resultTool;
  if (!tool) return;
  // 需求 2：切换 tab 时同步刷新地图上图，两源互斥显示
  if (name === "address") {
    const items = searchStore.addressResults.items;
    if (items.length) {
      tool.showAddressPoints(items.map((i) => i.lngLat).filter((c): c is [number, number] => !!c));
      tool.clearResources();
    } else {
      tool.clearFocus();
    }
  } else {
    tool.clearFocus();
    const filter = searchStore.activeFilter;
    if (filter.typeNames.length) tool.showResources(filter);
    else tool.clearResources();
  }
};

const onSelectResult = (item: (typeof activeBucket.value.items)[number]) => {
  if (!item.locatable || !item.lngLat) return;
  searchStore.selectItem(item);
  resultTool?.focusPoint(item.lngLat);
};

const onTogglePanel = () => {
  searchStore.toggleSearchPanel();
};

const onClosePanel = () => {
  searchStore.closeSearchPanel();
};

const onToggleRoute = () => {
  // 抑制 click 冒泡导致的 input-panel 误展开
  routeIconClicking.value = true;
  setTimeout(() => (routeIconClicking.value = false), 0);
  // 需求 1：点路径规划图标后收起视图下拉
  viewSelectVisible.value = false;
  // 需求 3 / 7：打开路径规划时折叠 cq-panel，两者上下顺序排列
  const willOpen = !searchStore.routePlanOpen;
  searchStore.toggleRoutePanel();
  if (willOpen && !searchStore.searchPanelCollapsed) {
    searchStore.toggleSearchPanel();
  }
};

const onFocusInput = () => {
  if (routeIconClicking.value) return;
  // 未发起检索前 cq-panel 保持隐藏，聚焦输入框只折叠路径规划面板 + 展开视图下拉
  if (searchStore.routePlanOpen && !searchStore.routePanelCollapsed) {
    searchStore.toggleRoutePanelCollapse();
  }
  viewSelectVisible.value = true;
};

const activeCount = computed(() => activeBucket.value?.items.length ?? 0);

onMounted(() => {
  EventBus.on("circle-query:update", onToolUpdate as any);
  EventBus.on("circle-query:close", onToolClose as any);
  if (currentTool && typeof currentTool.getSourceData === "function") {
    onToolUpdate(currentTool.getSourceData());
  }
});

onBeforeUnmount(() => {
  stopWatchTool();
  if (circleSyncTimer) {
    clearTimeout(circleSyncTimer);
    circleSyncTimer = null;
  }
  EventBus.off("circle-query:update");
  EventBus.off("circle-query:close");
  resultTool?.destroy();
  resultTool = null;
});
</script>

<template>
  <div class="search-panel-wrapper themed-panel">
    <!-- input-panel：检索框（路径规划图标前缀 + 查询按钮后缀） -->
    <div class="input-panel">
      <div class="input-panel-inner" @click="onFocusInput">
        <span class="input-icon-route" title="路径规划" @click.stop="onToggleRoute">
          <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
            <use xlink:href="#icon-route"></use>
          </svg>
        </span>
        <el-input
          v-model="queryText"
          class="input-el"
          placeholder="输入关键词查询地址 / 消防资源"
          clearable
          @focus="onFocusInput"
        />
        <el-button class="input-search-btn" :loading="loading" :disabled="!queryText.trim()" @click.stop="onQuery">
          查询
        </el-button>
      </div>

      <!-- 视图下拉（取 LAYER_SOURCE_CONFIGS：name 展示、id 查询） -->
      <div v-if="viewSelectVisible && viewOptions.length" class="view-dropdown">
        <div v-for="option in viewOptions" :key="option.id" class="view-option" @click.stop="onSelectView(option)">
          {{ option.name }}
        </div>
      </div>
    </div>

    <!-- cq-panel：检索结果 + 圈选配置 -->
    <div v-if="!searchPanelClosed" class="cq-panel">
      <div class="cq-header">
        <span class="cq-title">检索结果</span>
        <span class="cq-hdr-actions">
          <span
            class="cq-fold"
            role="img"
            tabindex="-1"
            :title="searchPanelCollapsed ? '展开' : '折叠'"
            @click="onTogglePanel"
          >
            <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
              <use :xlink:href="searchPanelCollapsed ? '#icon-unfold' : '#icon-closes'"></use>
            </svg>
          </span>
          <span class="cq-close" role="img" tabindex="-1" title="关闭" @click="onClosePanel">
            <svg width="1em" height="1em" fill="currentColor" aria-hidden="true">
              <use xlink:href="#icon-close"></use>
            </svg>
          </span>
        </span>
      </div>
      <template v-if="!searchPanelCollapsed">
        <!-- 双数据源 tab -->
        <el-tabs v-model="activeTab" class="cq-tabs" @tab-change="onTabChange">
          <el-tab-pane :label="`地址信息 (${searchStore.addressResults.items.length})`" name="address" />
          <el-tab-pane :label="`消防资源 (${searchStore.resourceResults.items.length})`" name="resource" />
        </el-tabs>

        <div v-if="activeBucket?.truncated" class="cq-truncated">结果已截断，仅显示前 10000 条</div>
        <div v-if="searchError" class="cq-error">{{ searchError }}</div>

        <div class="cq-list">
          <div v-if="loading" class="cq-empty">查询中…</div>
          <div v-else-if="!activeCount" class="cq-empty">未找到匹配结果</div>
          <div
            v-for="item in activeBucket?.items"
            v-else
            :key="item.key"
            class="cq-list-item"
            :class="{ active: selectedItem?.key === item.key, disabled: !item.locatable }"
            @click="onSelectResult(item)"
          >
            <div class="cq-item-title">{{ item.title }}</div>
            <div class="cq-item-sub">{{ item.subtitle }}</div>
          </div>
        </div>

        <!-- 圈选配置（保留原有统计） -->
        <template v-if="visible">
          <div class="cq-divider" />
          <div class="cq-section">
            <div class="cq-section-header">
              <div class="cq-section-title">搜索半径</div>
              <div class="cq-radius-value">{{ (radiusMeters / 1000).toFixed(2) }} 公里</div>
            </div>
            <div class="cq-radius">
              <el-slider
                :model-value="radiusMeters"
                :min="RADIUS_MIN_METERS"
                :max="RADIUS_MAX_METERS"
                :step="RADIUS_STEP_METERS"
                :show-tooltip="true"
                :format-tooltip="(v: number) => `${(v / 1000).toFixed(2)} 公里`"
                @update:modelValue="onSliderChange"
              />
            </div>
          </div>

          <div class="cq-divider" />

          <div class="cq-section">
            <div class="cq-section-title">设施类型</div>
            <div class="cq-types">
              <label
                v-for="t in ALL_RESOURCE_TYPES"
                :key="t.key"
                class="cq-type"
                :class="{ active: selectedTypes.includes(t.key) }"
              >
                <el-checkbox
                  :model-value="selectedTypes.includes(t.key)"
                  @update:modelValue="(v: boolean | string | number) => onToggleType(t.key, Boolean(v))"
                />
                <span class="cq-type-dot" :style="{ background: t.color }" />
                <span class="cq-type-label">{{ t.label }}</span>
                <span class="cq-type-count" :class="{ dim: !selectedTypes.includes(t.key) }">
                  {{ data?.stats.perType[t.key] ?? 0 }}
                </span>
              </label>
            </div>
          </div>

          <div class="cq-divider" />

          <div class="cq-section">
            <div class="cq-result">
              <span class="cq-result-label">查询结果</span>
              <span class="cq-result-num">{{ data?.stats.total ?? 0 }}</span>
              <span class="cq-result-unit">个</span>
            </div>
          </div>

          <div class="cq-divider" />

          <!-- 需求 10：清空圈，回到可重新绘制 -->
          <div class="cq-section">
            <el-button class="cq-clear-btn" @click="onClearCircle">清空圈选</el-button>
          </div>
        </template>
      </template>
    </div>

    <!-- 路径规划面板：与检索面板在同一个 flex 容器内上下顺序排列 -->
    <RoutePlanPanel />
  </div>
</template>

<style scoped lang="less">
.search-panel-wrapper {
  position: absolute;
  left: 0.5em;
  top: 0.5em;
  z-index: 7;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 360px;
}

.input-panel {
  position: relative;
}

.input-panel-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 4px 8px;
  box-shadow: var(--panel-shadow);
  cursor: text;
}

.input-icon-route {
  cursor: pointer;
  color: var(--accent-cyan);
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

.input-icon-route:hover {
  opacity: 0.8;
}

.input-el {
  flex: 1;
}

/* Requirement 6: the query button matches the path-planning analyze button */
.input-search-btn {
  height: 30px;
  padding: 0 16px;
  border-radius: 6px;
  font-size: 13px;
}

.input-fold {
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  display: inline-flex;
  flex: 0 0 auto;
}

.view-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  box-shadow: var(--panel-shadow);
  max-height: 260px;
  overflow-y: auto;
  z-index: 20;
}

.view-option {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  border-bottom: 1px solid var(--card-border);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--hover-border);
  }
}

.cq-panel {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: var(--panel-shadow);
  color: var(--text-primary);
  font-size: 13px;
  overflow: hidden;
  max-height: calc(100vh - 220px);
  display: flex;
  flex-direction: column;
}

.cq-header {
  background: var(--header-bg);
  color: var(--header-text);
  font-size: 15px;
  font-weight: 600;
  line-height: 40px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
}

.cq-title { letter-spacing: 1px; }

.cq-hdr-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.cq-fold,
.cq-close {
  cursor: pointer;
  font-size: 16px;
  color: var(--header-text);
  display: inline-flex;
}

.cq-fold:hover,
.cq-close:hover { opacity: 0.75; }
.cq-close { cursor: pointer; font-size: 16px; color: var(--header-text); }

.cq-tabs {
  padding: 0 8px;
  flex: 0 0 auto;
}

.cq-truncated,
.cq-error {
  margin: 0 12px 6px;
  padding: 6px 8px;
  font-size: 12px;
  border-radius: 4px;
}

.cq-truncated {
  background: var(--accent-gold-soft);
  color: var(--accent-gold);
}

.cq-error {
  background: rgba(255, 77, 79, 0.16);
  color: #ff6b6e;
}

.cq-list {
  flex: 1;
  min-height: 120px;
  max-height: 260px;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.cq-empty {
  padding: 20px 0;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.cq-list-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 4px;

  &:hover {
    background: var(--hover-border);
  }

  &.active {
    background: var(--accent-cyan-soft);
    outline: 1px solid var(--accent-cyan);
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.cq-item-title {
  font-size: 13px;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.cq-item-sub {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cq-divider {
  height: 1px;
  background: var(--primary-li-bottom-color);
  margin: 0 12px;
  flex: 0 0 auto;
}

.cq-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  flex: 0 0 auto;
}

.cq-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cq-clear-btn { width: 100%; }

.cq-section-title {
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
}

.cq-radius-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--accent-cyan-soft);
  padding: 2px 10px;
  border-radius: 4px;
}

.cq-types {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cq-type {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
}

.cq-type-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex: 0 0 auto;
}

.cq-type-label {
  color: var(--text-primary);
  flex: 1;
}

.cq-type-count {
  font-size: 16px;
  font-weight: 600;
  color: var(--accent-cyan);
}

.cq-type-count.dim {
  opacity: 0.45;
}

.cq-result {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 14px;
  background: var(--accent-cyan-soft);
  border-radius: 6px;
}

.cq-result-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.cq-result-num {
  font-size: 26px;
  font-weight: 700;
  color: var(--accent-cyan);
  line-height: 1;
}

.cq-result-unit {
  font-size: 13px;
  color: var(--text-secondary);
}

html[data-theme="NIGHT"] {
  .cq-type :deep(.el-checkbox__inner) {
    border-color: var(--accent-cyan);
    background: var(--widget-bg);
  }
  .cq-type :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
    border-color: var(--accent-cyan);
    background: var(--accent-cyan);
  }
}

:deep(.el-slider__runway) {
  background: var(--primary-li-bottom-color);
  height: 4px;
}

:deep(.el-slider__bar) {
  background: var(--accent-cyan);
  height: 4px;
}

:deep(.el-slider__button-wrapper) .el-slider__button {
  width: 14px;
  height: 14px;
  border: 2px solid var(--accent-cyan);
  background: var(--panel-bg);
}
</style>
