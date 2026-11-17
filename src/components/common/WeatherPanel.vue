<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { getBusinessMessageRuntime } from "@/controller/core/io/BusinessMessageRuntime";
import type { AreaWeatherController } from "@/controller/core/business/AreaWeatherController";
import { cssVar } from "@/utils/themeColor";
import { appEnv } from "@/config/env";

const props = withDefaults(
  defineProps<{
    map?: any;
    refreshIntervalMs?: number;
  }>(),
  { refreshIntervalMs: 10 * 60 * 1000 },
);

const defaultAdcode = appEnv.mapAdcode;

/** 下拉浮层宽度：从设计 token 读取，与 styles/tokens.less 保持单一真源 */
const dropdownWidth = Number.parseInt(cssVar("--weather-panel-dropdown-width", "390px"), 10) || 390;

/** 业务控制器由 Runtime 持有，组件不自行构建业务层 */
const controller = getBusinessMessageRuntime().business.areaWeather as AreaWeatherController;
const state = controller.getState();

let timer: number | null = null;
const activeTab = ref<"area" | "station">("area");

const rootChildren = computed(() => state.value.rootChildren);
const expandedChildren = computed(() => state.value.expandedChildren);
const selected = computed(() => state.value.selected);
const live = computed(() => state.value.live);
const stations = computed(() => state.value.stations);

/** 顶部条显示当前选中的区划名（面板未打开时用 env 城市名兜底） */
const currentLabel = computed(() => selected.value?.areaName ?? appEnv.mapCity);

/** 天气来源标注：街道级回退到上级区划时与所选区划不同 */
const liveSource = computed(() => state.value.liveSourceName);
const showLiveSource = computed(
  () => !!live.value && !!liveSource.value && liveSource.value !== selected.value?.areaName,
);

// 天气图标：按 weather 字段命中全局 svg（src/assets/icons-svg/weather-svg/），
// 经 Icon 组件以 svg-icon: 前缀渲染本地 sprite；命中不到时不展示。
const weatherIcon = computed(() => {
  const w = live.value?.weather?.trim();
  return w ? `svg-icon:weather-svg-${w}` : "";
});

/** 更新时间：高德 reporttime 为 "YYYY-MM-DD HH:mm:ss"，只取时分
 * 顶部条的「xx更新」已按需求移除，完整时间在天气详情浮层里展示，此处保留备用。
 */
// @ts-expect-error TS6133: 模板引用处已移除，保留备用
const updateTime = computed(() => {
  const matched = /(\d{2}):(\d{2})/.exec(live.value?.reporttime ?? "");
  return matched ? `${matched[1]}:${matched[2]}` : "";
});

/** 详情浮层里的体感舒适度：按温度与湿度粗分档 */
const comfortText = computed(() => {
  const temp = Number(live.value?.temperature);
  const humidity = Number(live.value?.humidity);
  if (!Number.isFinite(temp) || !Number.isFinite(humidity)) return "";
  if (temp >= 30) return humidity >= 70 ? "闷热" : "炎热";
  if (temp >= 25) return humidity >= 70 ? "湿热" : "较热";
  if (temp >= 18) return humidity >= 80 ? "潮湿" : "舒适";
  if (temp >= 10) return "微凉";
  if (temp >= 0) return "偏冷";
  return "寒冷";
});

/** 队站检索：默认折叠为图标，点击展开输入框 */
const stationSearch = ref("");
const searchExpanded = ref(false);
const searchInputRef = ref<HTMLInputElement | null>(null);

const toggleSearch = () => {
  searchExpanded.value = !searchExpanded.value;
  if (searchExpanded.value) {
    // 下一帧聚焦输入框
    requestAnimationFrame(() => searchInputRef.value?.focus());
  }
};

/** 按 areaName 分组 + 模糊检索 */
const groupedStations = computed(() => {
  const keyword = stationSearch.value.trim().toLowerCase();
  const filtered = keyword
    ? stations.value.filter((s) => s.name.toLowerCase().includes(keyword))
    : stations.value;
  const map = new Map<string, typeof stations.value>();
  for (const station of filtered) {
    const key = station.areaName || station.areaCode || "未知";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(station);
  }
  return Array.from(map, ([areaName, stationList]) => ({ areaName, stationList }));
});

const handleSelect = async (areaCode: string) => {
  if (!areaCode || areaCode === selected.value?.areaCode) return;
  await controller.selectArea(areaCode);
};

const handleSelectStation = async (stationId: string) => {
  await controller.selectStation(stationId);
};

onMounted(async () => {
  await controller.init(defaultAdcode);
  timer = window.setInterval(() => {
    void controller.refreshWeather();
  }, props.refreshIntervalMs);
});

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
  timer = null;
});
</script>

<template>
  <div class="weather_panel">
    <!-- 区划下拉：点市名展开三级区划清单 -->
    <el-popover
      placement="bottom-start"
      trigger="click"
      :width="dropdownWidth"
      popper-class="weather_panel_popper"
      :offset="6"
    >
      <template #reference>
        <div class="weather_panel_header">
          <!-- <span class="weather_panel_pin">📍</span> -->
          <span class="weather_panel_city_text">{{ currentLabel }}</span>
          <span class="weather_panel_arrow">▼</span>
        </div>
      </template>

      <div class="weather_panel_panel">
        <div class="weather_panel_panel_header">
          <button
            type="button"
            class="weather_panel_panel_title"
            :class="{ 'is-active': activeTab === 'area' }"
            @click="activeTab = 'area'"
          >
            {{ appEnv.mapCity }}
          </button>
          <button
            type="button"
            class="weather_panel_panel_title weather_panel_panel_title_plain"
            :class="{ 'is-active': activeTab === 'station' }"
            @click="activeTab = 'station'"
          >
            主管队站辖区
          </button>
        </div>

        <template v-if="activeTab === 'area'">
          <div class="weather_panel_grid weather_panel_grid_district">
            <button
              v-for="item in rootChildren"
              :key="item.areaCode"
              type="button"
              class="weather_panel_grid_item"
              :class="{ 'is-active': item.areaCode === selected?.areaCode }"
              @click="handleSelect(item.areaCode)"
            >
              {{ item.areaName }}
            </button>
          </div>

          <div class="weather_panel_grid weather_panel_grid_street">
            <button
              v-for="item in expandedChildren"
              :key="item.areaCode"
              type="button"
              class="weather_panel_grid_item"
              :class="{ 'is-active': item.areaCode === selected?.areaCode }"
              @click="handleSelect(item.areaCode)"
            >
              {{ item.areaName }}
            </button>
          </div>

          <div v-if="!rootChildren.length && !expandedChildren.length" class="weather_panel_panel_empty">
            暂无下级区划
          </div>
        </template>

        <template v-else>
          <!-- 队站检索区：默认折叠为 🔍 图标，点击展开输入框 -->
          <div class="weather_panel_station_search">
            <button
              type="button"
              class="weather_panel_search_toggle"
              :class="{ 'is-active': searchExpanded }"
              @click="toggleSearch"
            >
              🔍
            </button>
            <input
              v-show="searchExpanded"
              ref="searchInputRef"
              v-model="stationSearch"
              class="weather_panel_search_input"
              type="text"
              placeholder="搜索队站…"
              @blur="() => { if (!stationSearch.trim()) searchExpanded = false; }"
              @keyup.enter="() => {}"
            />
          </div>

          <div v-if="groupedStations.length" class="weather_panel_station_list">
            <div v-for="group in groupedStations" :key="group.areaName" class="weather_panel_station_group">
              <div class="weather_panel_station_area">{{ group.areaName }}</div>
              <button
                v-for="station in group.stationList"
                :key="station.id"
                type="button"
                class="weather_panel_station_item"
                @click="handleSelectStation(station.id)"
              >
                <span class="weather_panel_station_name">{{ station.name }}</span>
              </button>
            </div>
          </div>
          <div v-else class="weather_panel_panel_empty">暂无主管队站数据</div>
        </template>
      </div>
    </el-popover>

    <!-- 天气实况：点图标/温度展开详情 -->
    <el-popover placement="bottom-end" trigger="click" :width="260" popper-class="weather_panel_popper" :offset="8">
      <template #reference>
        <div class="weather_panel_body">
          <div class="weather_panel_main">
            <Icon v-if="weatherIcon" :icon="weatherIcon" :size="18" />
            <span class="weather_panel_temp"> {{ live?.temperature }}<span class="weather_panel_unit">℃</span> </span>
          </div>
          <div v-if="live" class="weather_panel_meta">
            <span>{{ live.winddirection }}风 {{ live.windpower }}级</span>
            <span class="weather_panel_dot">·</span>
            <span>湿度 {{ live.humidity }}%</span>
          </div>
        </div>
      </template>

      <div v-if="live" class="weather_panel_detail">
        <div class="weather_panel_detail_head">
          <Icon v-if="weatherIcon" :icon="weatherIcon" :size="32" class="weather_panel_detail_icon" />
          <div class="weather_panel_detail_head_text">
            <span class="weather_panel_detail_weather">{{ live.weather }}</span>
            <span class="weather_panel_detail_temp">
              {{ live.temperature }}<span class="weather_panel_unit">℃</span>
            </span>
          </div>
        </div>

        <div class="weather_panel_detail_list">
          <div class="weather_panel_detail_row">
            <span class="weather_panel_detail_label">所在地</span>
            <span class="weather_panel_detail_value">{{ live.province }}{{ live.city }}</span>
          </div>
          <div class="weather_panel_detail_row">
            <span class="weather_panel_detail_label">风向风力</span>
            <span class="weather_panel_detail_value"> {{ live.winddirection }}风 {{ live.windpower }}级 </span>
          </div>
          <div class="weather_panel_detail_row">
            <span class="weather_panel_detail_label">相对湿度</span>
            <span class="weather_panel_detail_value">{{ live.humidity }}%</span>
          </div>
          <div class="weather_panel_detail_row">
            <span class="weather_panel_detail_label">体感</span>
            <span class="weather_panel_detail_value">{{ comfortText || "—" }}</span>
          </div>
          <div v-if="showLiveSource" class="weather_panel_detail_row">
            <span class="weather_panel_detail_label">数据来源</span>
            <span class="weather_panel_detail_value">{{ liveSource }}</span>
          </div>
          <div v-if="live.maxTemperature || live.minTemperature" class="weather_panel_detail_row">
            <span class="weather_panel_detail_label">温度范围</span>
            <span class="weather_panel_detail_value">
              {{ live.minTemperature }}℃ ~ {{ live.maxTemperature }}℃
            </span>
          </div>
          <div v-if="live.precipitation" class="weather_panel_detail_row">
            <span class="weather_panel_detail_label">降水量</span>
            <span class="weather_panel_detail_value">{{ live.precipitation }}mm</span>
          </div>
          <div v-if="live.alertLevel" class="weather_panel_detail_row">
            <span class="weather_panel_detail_label">预警</span>
            <span class="weather_panel_detail_value weather_panel_detail_alert">{{ live.alertLevel }}</span>
          </div>
          <div v-if="live.alertDetail" class="weather_panel_detail_row weather_panel_detail_row_wrap">
            <span class="weather_panel_detail_label">预警详情</span>
            <span class="weather_panel_detail_value">{{ live.alertDetail }}</span>
          </div>
          <div class="weather_panel_detail_row">
            <span class="weather_panel_detail_label">更新时间</span>
            <span class="weather_panel_detail_value">{{ live.reporttime }}</span>
          </div>
        </div>
      </div>
      <div v-else class="weather_panel_panel_empty">暂无天气数据</div>
    </el-popover>

    <div v-if="state.errorMsg" class="weather_panel_error">{{ state.errorMsg }}</div>
  </div>
</template>

<style scoped lang="less">
.weather_panel {
  position: absolute;
  top: 0.5em;
  /* 右上角操作簇换位：调色盘居最右位，config 次之，天气面板最左（在 config 左沿之外） */
  right: calc(
    var(--top-actions-right) + var(--top-actions-size) + var(--top-actions-gap) +
      var(--top-actions-size) + var(--top-actions-gap)
  );
  z-index: 60;
  /* 固定宽度：内容超长时按溢出滚动展示，保证右上角按钮簇位置不被面板挤动 */
  width: var(--weather-panel-width);
  padding: 8px 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  backdrop-filter: blur(var(--glass-blur));
  box-shadow: var(--panel-shadow);
  pointer-events: auto;
  /* 单行不换行：各段横向排列，超长文本在段内滚动 */
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  white-space: nowrap;
  overflow: hidden;
}
.weather_panel_header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 1 auto;
  min-width: 0;
  cursor: pointer;
}
.weather_panel_pin {
  font-size: 12px;
  line-height: 1;
  flex-shrink: 0;
}
.weather_panel_arrow {
  font-size: 9px;
  color: var(--accent-cyan);
  line-height: 1;
  flex-shrink: 0;
}
.weather_panel_city_text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  /* 超长区划名在段内横向滚动，不撑破面板也不截断成省略号 */
  max-width: 88px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  text-overflow: ellipsis;
  min-width: 0;
  &::-webkit-scrollbar {
    display: none;
  }
}
.weather_panel_body {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 0 1 auto;
  min-width: 0;
  cursor: pointer;
}
.weather_panel_main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.weather_panel_temp {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}
.weather_panel_unit {
  font-size: 12px;
  font-weight: 500;
  margin-left: 2px;
  color: var(--text-muted);
}
.weather_panel_meta {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  /* 超长时在段内横向滚动 */
  max-width: 150px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  min-width: 0;
  &::-webkit-scrollbar {
    display: none;
  }
}
.weather_panel_dot {
  color: var(--text-muted);
}
.weather_panel_update {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.weather_panel_error {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  max-width: 90px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}
.weather_panel_error {
  color: var(--tag-danger-text);
}

/* ---------- 下拉面板内容 ---------- */
.weather_panel_panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.weather_panel_panel_header {
  display: flex;
  align-items: stretch;
  gap: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 1px dashed var(--panel-border);
}
.weather_panel_panel_title {
  flex: 1;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  padding: 4px 0;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-gold-soft);
  cursor: pointer;
}
.weather_panel_panel_title_plain {
  background: transparent;
  color: var(--text-secondary);
}
.weather_panel_panel_title_plain.is-active {
  background: var(--accent-gold-soft);
  color: var(--text-primary);
}
.weather_panel_grid {
  display: grid;
  gap: 2px var(--space-sm);
}
.weather_panel_grid_district {
  grid-template-columns: repeat(var(--weather-panel-district-columns), 1fr);
}
.weather_panel_grid_street {
  grid-template-columns: repeat(var(--weather-panel-street-columns), 1fr);
}
.weather_panel_grid_item {
  border: none;
  background: transparent;
  padding: 3px 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.weather_panel_grid_street .weather_panel_grid_item {
  color: var(--accent-cyan);
}
.weather_panel_grid_item:hover {
  color: var(--accent-cyan-strong);
}
.weather_panel_grid_item.is-active {
  color: var(--accent-gold);
  font-weight: 700;
}
.weather_panel_station_search {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 2px 0;
}
.weather_panel_search_toggle {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  opacity: 0.6;
  transition: opacity 0.15s;
}
.weather_panel_search_toggle:hover,
.weather_panel_search_toggle.is-active {
  opacity: 1;
}
.weather_panel_search_input {
  flex: 1 1 auto;
  min-width: 0;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg-solid);
  color: var(--text-primary);
  font-size: 12px;
  padding: 3px 6px;
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color 0.15s;
}
.weather_panel_search_input:focus {
  border-color: var(--accent-cyan);
}
.weather_panel_station_list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 320px;
  overflow-y: auto;
}
.weather_panel_station_group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.weather_panel_station_area {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-cyan);
  padding: 4px 0 2px;
  letter-spacing: 0.02em;
}
.weather_panel_station_item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-sm);
  border: none;
  background: transparent;
  text-align: left;
  padding: 3px 0 3px 8px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
}
.weather_panel_station_item:hover {
  color: var(--accent-cyan-strong);
}
.weather_panel_station_name {
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.weather_panel_panel_empty {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  padding: var(--space-md) 0;
}

/* ---------- 天气详情浮层 ---------- */
.weather_panel_detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.weather_panel_detail_head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 1px dashed var(--panel-border);
}
.weather_panel_detail_icon {
  font-size: 32px;
  line-height: 1;
}
.weather_panel_detail_head_text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.weather_panel_detail_weather {
  font-size: 13px;
  color: var(--text-secondary);
}
.weather_panel_detail_temp {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}
.weather_panel_detail_list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.weather_panel_detail_row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-sm);
  font-size: 12px;
}
.weather_panel_detail_label {
  color: var(--text-muted);
  flex-shrink: 0;
}
.weather_panel_detail_value {
  color: var(--text-primary);
  text-align: right;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.weather_panel_detail_alert {
  color: var(--tag-danger-text);
  font-weight: 700;
}
.weather_panel_detail_row_wrap {
  align-items: flex-start;
}
.weather_panel_detail_row_wrap .weather_panel_detail_value {
  white-space: normal;
  word-break: break-word;
  line-height: 1.4;
  max-height: 100px;
  overflow-y: auto;
}
</style>

<style lang="less">
/* 下拉浮层挂在 body 上（非 scoped），单独一块样式 */
.weather_panel_popper {
  --el-bg-color-overlay: var(--panel-bg-solid);
  --el-text-color-regular: var(--text-primary);
  background: var(--panel-bg-solid);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-md);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(var(--glass-blur));
}
.weather_panel_popper .el-popper__arrow::before {
  background: var(--panel-bg-solid);
  border-color: var(--panel-border);
}
</style>
