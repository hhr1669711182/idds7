<script setup lang="ts">
import { ref, computed } from "vue";
import { ElMessage } from "element-plus";
import { fetchInputTips } from "../amap/useAmapTools.ts";
import amapData from "../amap/data.json";
import { useFireStations } from "@/composables/useFireStations";
import { addrCtrl } from "@/controller/map";
import { EventBus } from "@/utils";

const props = defineProps<{
  nav: any;
  alarmData: any;
}>();

const emit = defineEmits(["update:alarmData", "clear"]);

const configList = Array.isArray(amapData) ? (amapData as any[]) : [amapData as any];
const firstCfg = (configList[0] || {}) as any;
const regionCfg = firstCfg.data || firstCfg;

const amapKey = ref<string>("7405ae6dde247ee87be4e7d8021056f4");

const ensureAmapKey = () => {
  if (amapKey.value) return amapKey.value;
  const input = window.prompt("请输入高德 Web 服务 Key（用于行政区边界/路径规划）", "");
  if (!input) return "";
  amapKey.value = input.trim();
  localStorage.setItem("AMAP_WEBSERVICE_KEY", amapKey.value);
  return amapKey.value;
};

type TipItem = {
  id?: string;
  name: string;
  address?: string;
  district?: string;
  adcode?: string;
  location?: [number, number];
};

const startText = ref("");
const endText = ref("");
const startCoord = ref<[number, number] | null>(null);
const endCoord = ref<[number, number] | null>(null);
const isPlanning = ref(false);

const canStart = computed(() => !!endCoord.value && !isPlanning.value);

const formatTipText = (t: TipItem) => {
  const parts = [t.name, t.district, t.address].filter(Boolean);
  return parts.join(" ");
};

const loadBeijingMaskIfReady = async () => {
  if (!props.nav || !amapKey.value) return;
  try {
    await props.nav.loadMask((regionCfg?.boundaries as any) || []);
  } catch {
    return;
  }
};

const fetchDisasterSuggestions = async (queryString: string, cb: any): Promise<any> => {
  const q = (queryString || "").trim();
  if (!q) {
    cb([] as any);
    return;
  }
  if (!props.nav) {
    cb([] as any);
    return;
  }
  const key = ensureAmapKey();
  if (!key) {
    cb([] as any);
    return;
  }
  props.nav.setKey(key);
  await loadBeijingMaskIfReady();

  try {
    const tips = (await fetchInputTips({
      key,
      keywords: q,
      city: (regionCfg?.city as string) || "",
      citylimit: true,
    })) as TipItem[];

    const items = tips
      .filter((t) => t.location && Number.isFinite(t.location[0]) && Number.isFinite(t.location[1]))
      .map((t) => ({
        ...t,
        value: formatTipText(t),
      }));

    cb(items as any);
  } catch {
    cb([] as any);
  }
};

const onDisasterSelect = (item: any) => {
  const loc = item?.location as [number, number] | undefined;
  if (!loc) return;
  endText.value = item?.value || formatTipText(item);
  endCoord.value = loc;
  
  // 地图视口移动逻辑，由父组件通过事件处理或保留原有nav逻辑
  if (props.nav && props.nav.map) {
    props.nav.map.getView().animate({
      center: (window as any).ol.proj.fromLonLat(loc),
      duration: 300,
    });
    props.nav.setEndpoint("end", loc);
  }
};

const { getNearestFireStation } = useFireStations();

const pickOnMap = async (type: "start" | "end") => {
  if (!props.nav) return;
  const key = ensureAmapKey();
  if (!key) return;
  props.nav.setKey(key);
  await loadBeijingMaskIfReady();

  const picked = await props.nav.pickAddressPoint(type);
  if (!picked) return;

  if (type === "start") {
    startText.value = picked.address;
    startCoord.value = picked.lngLat;
  } else {
    endText.value = picked.address;
    endCoord.value = picked.lngLat;
    addrCtrl.send(picked);
  }
};

const startSimulate = async (orgs?: any[], d?: any) => {
  if (!props.nav || !endCoord.value) return;
  const key = ensureAmapKey();
  if (!key) return;
  props.nav.setKey(key);
  await loadBeijingMaskIfReady();

  isPlanning.value = true;
  try {
    let nearests: any[] = [];
    let nearest = {} as any;
    if (orgs && orgs.length) {
      nearests = orgs;
    } else {
      nearest = await getNearestFireStation(endCoord.value);
    }

    const starts: [number, number][] = nearests.length
      ? nearests.filter((org) => Number.isFinite(org?.gisX) && Number.isFinite(org?.gisY)).map((org) => [org.gisX, org.gisY])
      : nearest?.station ? [[nearest.station.lng, nearest.station.lat]] : [];

    if (!starts.length) {
      ElMessage.warning("未找到可用的消防站坐标");
      return;
    }

    startCoord.value = starts[0];
    startText.value = nearests.length ? nearests.map((org) => org.orgName || org.title).join(", ") : nearest.station.title;

    starts.forEach((start, index) => {
      if (index === 0) {
        props.nav.setEndpoint("start", start);
      }
    });

    props.nav.setEndpoint("alarm", endCoord.value, {
      alarmData: props.alarmData || undefined,
    });

    if (starts.length > 1) {
      await props.nav.planAndStartMulti(starts, endCoord.value, d);
    } else {
      await props.nav.planAndStart(starts[0], endCoord.value, d);
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : "路径规划失败");
  } finally {
    isPlanning.value = false;
  }
};

const clearNav = () => {
  props.nav?.stop();
  props.nav?.clearEndpoints();
  startText.value = "";
  endText.value = "";
  startCoord.value = null;
  endCoord.value = null;
  emit("clear");
};

defineExpose({
  startSimulate,
  endCoord,
  endText,
});
</script>

<template>
  <div class="nav_panel_new">
    <div class="nav_row">
      <el-button class="nav_pick" type="primary" @click="pickOnMap('end')">选点</el-button>
      <div class="nav_field">
        <el-autocomplete
          v-model="endText"
          class="nav_input_ep"
          placeholder="输入查询灾情位置"
          :fetch-suggestions="fetchDisasterSuggestions"
          :trigger-on-focus="false"
          clearable
          @select="onDisasterSelect"
        />
      </div>
      <div class="nav_actions">
        <el-button type="primary" :disabled="!canStart" @click="() => startSimulate()">
          {{ isPlanning ? "规划中..." : "开始" }}
        </el-button>
        <el-button :disabled="isPlanning" @click="clearNav">清除</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
@import "./map.less";
</style>
