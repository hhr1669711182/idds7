<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed } from "vue";
import { weather as weatherApi, type AmapWeatherLive } from "@/apis/amap";
import dataJson from "@/baseComponent/amap/data.json";

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
        <div class="weather_panel_temp">
          {{ live.temperature }}<span class="weather_panel_unit">℃</span>
        </div>
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
  right: 0.5em;
  z-index: 60;
  min-width: 220px;
  max-width: 380px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(8px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
  pointer-events: auto;
  display: flex;
}
.weather_panel_header { display: flex; align-items: center; gap: 8px; }
.weather_panel_city_text { font-size: 13px; font-weight: 600; color: #111827; }
.weather_panel_loading, .weather_panel_error { font-size: 12px; color: rgba(17, 24, 39, 0.7); }
.weather_panel_error { color: #b91c1c; }
.weather_panel_body { display: flex; gap: 12px; align-items: center; }
.weather_panel_main { display: flex; align-items: center; gap: 8px; }
.weather_panel_icon { font-size: 18px; line-height: 1; }
.weather_panel_temp { font-size: 16px; font-weight: 700; color: #111827; line-height: 1; }
.weather_panel_unit { font-size: 12px; font-weight: 500; margin-left: 2px; color: rgba(17, 24, 39, 0.7); }
.weather_panel_meta { font-size: 12px; color: rgba(17, 24, 39, 0.65); display: flex; align-items: center; gap: 6px; }
.weather_panel_dot { color: rgba(17, 24, 39, 0.35); }
</style>
