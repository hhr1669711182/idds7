<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from "vue";
import { weather as weatherApi, type AmapWeatherLive } from "@/apis/amap";
import dataJson from "@/assets/map/config/data.json";

const props = withDefaults(
  defineProps<{
    map?: any;
    refreshIntervalMs?: number;
  }>(),
  { refreshIntervalMs: 10 * 60 * 1000 },
);

let timer: number | null = null;

const live = ref<AmapWeatherLive | null>(null);
const cityLabel = ref<string>(dataJson[0].data.city);
const adcode = ref<string>(dataJson[0].data.adcode);
const loading = ref(false);
const errorMsg = ref<string>("");

const weatherIcon = computed(() => {
  const w = live.value?.weather ?? "";
  if (w.includes("晴")) return "☀️";
  if (w.includes("云") || w.includes("阴")) return "⛅";
  if (w.includes("雨")) return "🌧";
  if (w.includes("雪")) return "❄️";
  if (w.includes("雾") || w.includes("霾")) return "🌫";
  if (w.includes("雷")) return "⛈";
  return "🌤";
});

const fetchByAdcode = async (code: string) => {
  if (!code) return;
  loading.value = true;
  errorMsg.value = "";
  try {
    const data = await weatherApi({ city: code });
    const item = data?.lives?.[0];
    if (item) {
      live.value = item;
      if (item.city) cityLabel.value = item.city;
    } else {
      live.value = null;
      errorMsg.value = "暂无天气数据";
    }
  } catch (e: any) {
    live.value = null;
    errorMsg.value = e?.errMessage ?? e?.message ?? "天气获取失败";
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchByAdcode(adcode.value);
  timer = window.setInterval(() => {
    fetchByAdcode(adcode.value);
  }, props.refreshIntervalMs);
});

onBeforeUnmount(() => {
   timer && window.clearInterval(timer);
   timer = null;
});
</script>

<template>
  <div class="weather_panel">
    <div class="weather_panel_header">
      <span class="weather_panel_city_text">{{ cityLabel }}</span>
    </div>

    <div v-if="loading && !live" class="weather_panel_loading">加载中...</div>

    <div v-else-if="errorMsg" class="weather_panel_error">
      {{ errorMsg }}
    </div>

    <div v-else-if="live" class="weather_panel_body">
      <div class="weather_panel_main">
        <div class="weather_panel_icon">{{ weatherIcon }}</div>
        <div class="weather_panel_temp">{{ live.temperature }}<span class="weather_panel_unit">℃</span></div>
      </div>
      <div class="weather_panel_meta">
        <span>{{ live.winddirection }}风 {{ live.windpower }}级</span>
        <span class="weather_panel_dot">·</span>
        <span>湿度 {{ live.humidity }}%</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.weather_panel {
  position: absolute;
  top: 0.5em;
  right: var(--top-actions-right);
  z-index: 60;
  /* 固定宽度：内容超长时截断，保证右上角按钮簇位置不被面板挤动 */
  width: var(--weather-panel-width);
  padding: 12px 14px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  backdrop-filter: blur(var(--glass-blur));
  box-shadow: var(--panel-shadow);
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  overflow: hidden;
}
.weather_panel_header {
  display: flex;
  align-items: center;
  gap: 8px;
  /* 允许收缩：城市名过长时按省略号截断，而不是把右侧内容挤出面板 */
  flex: 0 1 auto;
  min-width: 0;
}
.weather_panel_city_text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.weather_panel_loading, .weather_panel_error { font-size: 12px; color: var(--text-muted); }
.weather_panel_error { color: var(--tag-danger-text); }
.weather_panel_body {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
  overflow: hidden;
}
.weather_panel_main { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.weather_panel_icon { font-size: 18px; line-height: 1; }
.weather_panel_temp { font-size: 16px; font-weight: 700; color: var(--text-primary); line-height: 1; }
.weather_panel_unit { font-size: 12px; font-weight: 500; margin-left: 2px; color: var(--text-muted); }
.weather_panel_meta {
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.weather_panel_dot { color: var(--text-muted); }
</style>
