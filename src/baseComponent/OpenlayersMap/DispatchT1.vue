<!--
 * @Author: ljh
 * @Date: 2026-08-27 10:30:08
 * @LastEditTime: 2026-08-27 10:39:46
 * @LastEditors: ljh
 * @Description: 消防调派队站信息、车辆选择及调派操作面板。
 * @FilePath: src\baseComponent\OpenlayersMap\DispatchT1.vue
-->
<script lang="ts">
import { useUserStore } from '@/store/useUserStore';
import type { DispatchT1State as DispatchSnapshot } from './DispatchT1';

const trackingFocusStates = new WeakMap<ReturnType<typeof useUserStore>, { context: string; done: boolean }>();

declare global {
  interface Window {
    simulateDispatchCoordinate?: (
      longitude: number,
      latitude: number,
    ) => Promise<Readonly<DispatchSnapshot> | null>;
  }
}
</script>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';
import type OlMap from 'ol/Map';
import Overlay from 'ol/Overlay';
import { transform } from 'ol/proj';
import TileWMS from 'ol/source/TileWMS';
import { unByKey } from 'ol/Observable';
import type { EventsKey } from 'ol/events';
import { useDispatchT1Store, isStandbyVehicleStatus } from '@/store/useDispatchT1Store';//T1调派状态
import { useDispatch1MapStore } from '@/store/useDispatch1MapStore';//T1调派状态
import { getBusinessMessageRuntime } from '@/controller/core/io/BusinessMessageRuntime';
import { VEHICLE_STATUS_TEXT } from '@/const/const.business.type';
import type {
  CarLocationBatch,
} from '@/controller/core/protocol/LegacyMessageProtocol';
import { geoserverApi } from '@/apis/geoserver';
import { useFireStations } from '@/composables/useFireStations';
import {
  DispatchT1,
  type DispatchT1State,
  type DispatchT1Station,
  type DispatchT1Vehicle,
  type DispatchT1VehicleCommand,
  type DispatchT1WebSocketData,
} from './DispatchT1';
import { getSharedMapStage } from '@/utils/seatSharedState';
import { useVehicleTrackStore } from '@/store/useVehicleTrackStore';
import { isTerminalIncidentState } from '@/utils/incidentState';

const props = defineProps<{
  map: OlMap | null;
  amapKey?: string;
}>();

const emit = defineEmits<{
  dispatch: [command: DispatchT1VehicleCommand];
  cancelDispatch: [];
  querySuccess: [state: Readonly<DispatchT1State>];
  error: [error: unknown];
  close: [];
}>();

const dispatchT1Store = useDispatchT1Store();
const dispatch1MapStore = useDispatch1MapStore();
const userStore = useUserStore();
const realtimeFocus = trackingFocusStates.get(userStore) ?? { context: '', done: false };
trackingFocusStates.set(userStore, realtimeFocus);
const state = computed<DispatchT1State>(() => dispatchT1Store.$state);
const service = shallowRef<DispatchT1 | null>(null);
// @ts-expect-error TS6133: 引用处已注释，保留备用
const stationPopupRef = ref<HTMLElement | null>(null);
const stationOverlay = shallowRef<Overlay | null>(null);
const stationOverlayMap = shallowRef<OlMap | null>(null);
const hydrantPopupRef = ref<HTMLElement | null>(null);
const hydrantOverlay = shallowRef<Overlay | null>(null);
const hydrantOverlayMap = shallowRef<OlMap | null>(null);
const hydrantInfo = ref<{
  title: string;
  rows: Array<{ label: string; value: unknown }>;
} | null>(null);
let hydrantClickKey: EventsKey | null = null;
let hydrantRequestVersion = 0;
let pendingWebSocketData: DispatchT1WebSocketData | null = null;
let vehicleLocationUnsubscribe: (() => void) | null = null;
let alarmProfileUnsubscribe: (() => void) | null = null;
watch(
  () => userStore.sessionEpoch,
  () => {
    pendingWebSocketData = null;
    service.value?.reset();
  },
  { flush: 'sync' },
);
watch(
  () => JSON.stringify([
    userStore.sessionEpoch,
    getSharedMapStage(userStore.rawState, userStore.MapMode),
    userStore.currentAlarm?.incidentId ?? null,
  ]),
  (context) => {
    if (realtimeFocus.context === context) return;
    realtimeFocus.context = context;
    realtimeFocus.done = false;
  },
  { immediate: true, flush: 'sync' },
);

const HYDRANT_LAYER = 'gis:env_fire_water';

const visible = computed(() => state.value.status !== 'idle');
const activeStation = computed(() => state.value.stations.find(
  (station) => station.id === state.value.activeStationId && station.detailsVisible,
) ?? null);
const canCancelDispatch = computed(() => state.value.stations.some(
  (station) => station.routeStatus !== 'idle'
    || station.vehicles.some((vehicle) => vehicle.selected || vehicle.dispatched),
));
const buttonText = computed(() => {
  if (state.value.status === 'dispatching') return '调派中...';
  return state.value.selectedVehicleCount
    ? `调派（${state.value.selectedVehicleCount}）`
    : '调派';
});

// 主管队站 WFS 数据（gis:view_res_org_dept）：用 vehicle.orgId 反查队站属性 id，取 org_name（归一化后为 title）显示所属机构
const { stations: fireStations, load: loadFireStations } = useFireStations();
const fireStationNameById = computed(() => {
  // 跨接口 id 可能存在 number/string 混用，统一归一为 trim 后的字符串再关联
  const map = new Map<string, string>();
  for (const station of fireStations.value) {
    if (station?.id !== undefined && station?.id !== null) {
      map.set(String(station.id).trim(), station.title);
    }
  }
  return map;
});
const vehicleStatusText = (vehicle: DispatchT1Vehicle): string => {
  const raw = vehicle.status?.trim();
  if (!raw) return '状态未知';
  // 枚举约定为大写；大小写/空白漂移时兜底归一，未知状态原样透传便于发现新枚举
  return VEHICLE_STATUS_TEXT[raw.toUpperCase()] ?? raw;
};
// 仅“待命（DAILY_STANDBY）”车辆允许勾选调派
const isVehicleSelectable = (vehicle: DispatchT1Vehicle): boolean =>
  isStandbyVehicleStatus(vehicle.status);
const vehicleOrgName = (vehicle: DispatchT1Vehicle): string => {
  const orgId = vehicle.orgId === null || vehicle.orgId === undefined
    ? ''
    : String(vehicle.orgId).trim();
  if (orgId) {
    const stationName = fireStationNameById.value.get(orgId);
    if (stationName) return stationName;
  }
  return vehicle.orgName?.trim() || '暂无';
};

const createService = (map: OlMap) => {
  destroyService();
  const instance = new DispatchT1(map, {
    amapKey: props.amapKey,
    isLayerVisible: (layerId) => dispatch1MapStore.checkedIds.includes(layerId),
    onDispatch: async (command) => emit('dispatch', command),
  });
  service.value = instance;
  // 警情画像与车辆 GPS 同构：统一经 Runtime 订阅，注册即 hydrate 缓存值，
  // 避免消息先于页面挂载到达时丢失（原实现靠 store→prop→watch 倒挂传递）。
  alarmProfileUnsubscribe = getBusinessMessageRuntime().attachAlarmProfile((profile) => {
    if (service.value === instance) void receiveWebSocket(profile);
  });
  vehicleLocationUnsubscribe = getBusinessMessageRuntime().attachTracking((data) => {
    if (service.value === instance) receiveVehicleLocations(data);
  });
  void nextTick(() => {
    // ensureStationOverlay(); 车辆列表弹窗当前阶段注释调先
    ensureHydrantQuery();
  });
  if (pendingWebSocketData) {
    const data = pendingWebSocketData;
    pendingWebSocketData = null;
    void receiveWebSocket(data);
  }
};

const destroyService = () => {
  alarmProfileUnsubscribe?.();
  alarmProfileUnsubscribe = null;
  vehicleLocationUnsubscribe?.();
  vehicleLocationUnsubscribe = null;
  hydrantRequestVersion += 1;
  if (hydrantClickKey) {
    unByKey(hydrantClickKey);
    hydrantClickKey = null;
  }
  if (hydrantOverlayMap.value && hydrantOverlay.value) {
    hydrantOverlayMap.value.removeOverlay(hydrantOverlay.value);
  }
  hydrantOverlay.value = null;
  hydrantOverlayMap.value = null;
  hydrantInfo.value = null;
  if (stationOverlayMap.value && stationOverlay.value) {
    stationOverlayMap.value.removeOverlay(stationOverlay.value);
  }
  stationOverlay.value = null;
  stationOverlayMap.value = null;
  service.value?.destroy();
  service.value = null;
};

const closeHydrantPopup = () => {
  hydrantInfo.value = null;
  hydrantOverlay.value?.setPosition(undefined);
  service.value?.setGenericFeaturePopupSuppressed(false);
};

// 终态警情由车辆历史轨迹接管：清掉调派模块已渲染的队站、路线与车辆
const vehicleTrackStore = useVehicleTrackStore();
watch(
  () => [vehicleTrackStore.terminalIncidentId, vehicleTrackStore.terminalState] as const,
  ([incidentId, terminalState]) => {
    if (!incidentId || !isTerminalIncidentState(terminalState)) return;
    service.value?.reset();
  },
  { flush: 'sync' },
);

const ensureHydrantQuery = () => {
  const map = props.map;
  const element = hydrantPopupRef.value;
  if (!map || !element) return;

  if (!hydrantOverlay.value) {
    const overlay = new Overlay({
      element,
      positioning: 'bottom-center',
      offset: [0, -24],
      stopEvent: true,
      autoPan: { animation: { duration: 250 }, margin: 24 },
    });
    map.addOverlay(overlay);
    hydrantOverlay.value = overlay;
    hydrantOverlayMap.value = map;
  }

  if (!hydrantClickKey) {
    hydrantClickKey = map.on('singleclick', (event) => {
      void queryHydrant(event.coordinate);
    });
  }
};

const queryFeatureProperties = async (
  layerId: string,
  coordinate: number[],
): Promise<Record<string, any> | null> => {
  const map = props.map;
  if (!map) return null;

  const view = map.getView();
  const projection = view.getProjection();
  const source = new TileWMS({
    url: geoserverApi.getWMSServiceUrl('gis'),
    params: {
      LAYERS: layerId,
      VERSION: '1.1.0',
    },
  });
  const url = source.getFeatureInfoUrl(
    coordinate,
    view.getResolution() ?? 0,
    projection,
    {
      INFO_FORMAT: 'application/json',
      FEATURE_COUNT: 1,
    },
  );
  if (!url) return null;

  const urlObject = new URL(url, window.location.origin);
  const data = await geoserverApi.getWMSFeatureInfo('gis', {
    layers: layerId,
    query_layers: layerId,
    bbox: urlObject.searchParams.get('BBOX') ?? '',
    width: Number(urlObject.searchParams.get('WIDTH')),
    height: Number(urlObject.searchParams.get('HEIGHT')),
    x: Number(urlObject.searchParams.get('X') ?? urlObject.searchParams.get('I')),
    y: Number(urlObject.searchParams.get('Y') ?? urlObject.searchParams.get('J')),
    cql_filter: '1=1',
    feature_count: 1,
    srs: projection.getCode(),
  });
  return data?.features?.[0]?.properties ?? null;
};

const showFeaturePopup = (
  coordinate: number[],
  title: string,
  properties: Record<string, any>,
  fieldLabels: Record<string, string>,
) => {
  const rows = Object.entries(fieldLabels)
    .filter(([key]) => properties[key] !== null && properties[key] !== undefined && properties[key] !== '')
    .map(([key, label]) => ({ label, value: properties[key] }));

  hydrantInfo.value = { title, rows };
  stationOverlay.value?.setPosition(undefined);
  hydrantOverlay.value?.setPosition(coordinate);
};

const queryHydrant = async (coordinate: number[]) => {
  const version = ++hydrantRequestVersion;
  const map = props.map;
  if (!map) {
    closeHydrantPopup();
    return;
  }

  try {
    if (!dispatch1MapStore.checkedIds.includes(HYDRANT_LAYER)) {
      closeHydrantPopup();
      return;
    }

    const hydrantProperties = await queryFeatureProperties(HYDRANT_LAYER, coordinate);
    if (version !== hydrantRequestVersion) return;
    if (!hydrantProperties) {
      closeHydrantPopup();
      return;
    }
    const hydrantName = String(
      hydrantProperties.water_name
      ?? hydrantProperties.symc
      ?? hydrantProperties.name
      ?? '-'
    );
    const hydrantAddress = String(
      hydrantProperties.address
      ?? hydrantProperties.sydz
      ?? '-'
    );
    showFeaturePopup(
      coordinate,
      hydrantName === '-' ? '消防栓' : hydrantName,
      {
        address: hydrantAddress,
        name: hydrantName,
      },
      {
        address: '地址',
        name: '名称',
      },
    );
    service.value?.setGenericFeaturePopupSuppressed(true);
  } catch (error) {
    if (version !== hydrantRequestVersion) return;
    closeHydrantPopup();
    emit('error', error);
    console.error('[DispatchT1] 查询队站或消防栓信息失败', error);
  }
};

// const ensureStationOverlay = () => {
//   const map = props.map;
//   const element = stationPopupRef.value;
//   if (!map || !element || stationOverlay.value) return;
//   const overlay = new Overlay({
//     element,
//     positioning: 'bottom-center',
//     offset: [0, -30],
//     stopEvent: true,
//     autoPan: { animation: { duration: 250 }, margin: 24 },
//   });
//   map.addOverlay(overlay);
//   stationOverlay.value = overlay;
//   stationOverlayMap.value = map;
//   updateStationOverlay();
// };

const updateStationOverlay = () => {
  const station = activeStation.value;
  const map = props.map;
  const overlay = stationOverlay.value;
  if (!station || !map || !overlay) {
    overlay?.setPosition(undefined);
    return;
  }
  overlay.setPosition(transform(
    [station.longitude, station.latitude],
    'EPSG:4326',
    map.getView().getProjection(),
  ));
};

const receiveWebSocket = async (data: DispatchT1WebSocketData) => {
  console.info('[DispatchT1] 地图组件已收到警情', { mapReady: Boolean(service.value) });
  const instance = service.value;
  if (!instance) {
    pendingWebSocketData = data;
    return null;
  }
  const epoch = userStore.sessionEpoch;
  const isCurrent = () => service.value === instance && userStore.sessionEpoch === epoch;
  try {
    const result = await instance.handleWebSocketMessage(data);
    if (!isCurrent()) return null;
    emit('querySuccess', result);
    return result;
  } catch (error) {
    if (!isCurrent()) return null;
    emit('error', error);
    throw error;
  }
};

const simulateCoordinate = async (longitude: number, latitude: number) => {
  const instance = service.value;
  if (!instance) throw new Error('地图尚未初始化');
  const epoch = userStore.sessionEpoch;
  const isCurrent = () => service.value === instance && userStore.sessionEpoch === epoch;
  try {
    const result = await instance.simulateCoordinate(longitude, latitude);
    if (!isCurrent()) return null;
    emit('querySuccess', result);
    return result;
  } catch (error) {
    if (!isCurrent()) return null;
    emit('error', error);
    throw error;
  }
};

const receiveVehicleLocations = (batch: CarLocationBatch) => {
  console.log('receiveVehicleLocations', batch)
  if (!batch || !Array.isArray(batch.datas)) return 0;

  // 首次收到实时定位：以第一个有效点位为中心缩放至 zoom:16
  if (!realtimeFocus.done) {
    const first = batch.datas.find(
      (p) => Number.isFinite(p.longitude) && Number.isFinite(p.latitude),
    );
    const map = props.map;
    if (first && map) {
      const center = transform(
        [first.longitude, first.latitude],
        'EPSG:4326',
        map.getView().getProjection(),
      );
      map.getView().animate({ center, zoom: 16 });
      realtimeFocus.done = true;
    }
  }

  if (service.value) return service.value.updateVehicleLocations(batch);

  return 0;
};

const activateStation = (stationId: string) => {
  service.value?.activateStation(stationId);
};

const toggleVehicle = async (
  stationId: string,
  vehicleId: string,
  event: Event,
) => {
  const selected = (event.target as HTMLInputElement).checked;
  await service.value?.toggleVehicle(stationId, vehicleId, selected);
};

const dispatchVehicles = async () => {
  console.log("“进来了吗”")
  try {
    await service.value?.dispatchSelectedVehicles();
  } catch (error) {
    emit('error', error);
  }
  // 按各车已规划路线模拟实时跟踪；调派成功或失败都会触发，收到真实 GPS 时模拟自动让行
  service.value?.simulateVehicleTracking();
};

const cancelDispatch = () => {
  service.value?.cancelDispatch();
  emit('cancelDispatch');
};

const formatDistance = (distance?: number) => {
  if (!Number.isFinite(distance)) return '';
  return distance! >= 1_000
    ? `${(distance! / 1_000).toFixed(1)} km`
    : `${Math.round(distance!)} m`;
};

const routeDescription = (station: DispatchT1Station) => {
  if (station.routeStatus === 'planning') return '路线规划中...';
  if (station.routeStatus === 'error') return station.routeError ?? '路径规划失败';
  if (station.routeStatus !== 'ready') return '';
  const minutes = Math.max(1, Math.round((station.routeDurationSeconds ?? 0) / 60));
  return `路线 ${formatDistance(station.routeDistanceMeters)}，预计 ${minutes} 分钟`;
};

/** 车辆预计到达优先使用队站路线规划结果，未规划时回退到接口返回的 eta。 */
const vehicleEtaText = (vehicle: DispatchT1Vehicle, station: DispatchT1Station) => {
  if (station.routeStatus === 'ready' && station.routeDurationSeconds != null) {
    return `${Math.max(1, Math.round(station.routeDurationSeconds / 60))} 分钟`;
  }
  return vehicle.etaSeconds == null ? '暂无估算' : `${vehicle.etaSeconds} 秒`;
};

watch(
  () => props.map,
  (map) => {
    if (map) createService(map);
    else destroyService();
  },
  { immediate: true },
);

watch(
  () => [
    activeStation.value?.id,
    activeStation.value?.longitude,
    activeStation.value?.latitude,
  ],
  () => void nextTick(updateStationOverlay),
  { flush: 'post' },
);

onMounted(() => {
  // ensureStationOverlay(); 车辆列表弹窗当前阶段注释调先
  ensureHydrantQuery();
  // 预加载主管队站 WFS 数据用于车辆所属机构反查（单例缓存，失败不阻塞调派面板）
  void loadFireStations().catch(() => undefined);
  window.simulateDispatchCoordinate = simulateCoordinate;
  // console.info('[DispatchT1] 坐标模拟入口已注册');
});

onBeforeUnmount(() => {
  if (window.simulateDispatchCoordinate === simulateCoordinate) {
    delete window.simulateDispatchCoordinate;
  }
  destroyService();
});

defineExpose({
  receiveWebSocket,
  receiveVehicleLocations,
  simulateCoordinate,
  activateStation,
  toggleVehicle: (
    stationId: string,
    vehicleId: string,
    selected: boolean,
  ) => service.value?.toggleVehicle(stationId, vehicleId, selected),
  dispatchSelectedVehicles: () => service.value?.dispatchSelectedVehicles(),
  simulateVehicleTracking: () => service.value?.simulateVehicleTracking(),
  cancelDispatch: () => service.value?.cancelDispatch(),
  reset: () => service.value?.reset(),
  getState: () => service.value?.getState(),
});
</script>

<template>
  <div style="display: none;" v-if="visible" class="dispatch-global-actions">
    <button
      type="button"
      class="dispatch-button"
      :disabled="!state.canDispatch || state.status === 'dispatching'"
      @click="dispatchVehicles"
    >
      {{ buttonText }}
    </button>
    <button
      type="button"
      class="cancel-dispatch-button"
      :disabled="!canCancelDispatch || state.status === 'dispatching'"
      @click="cancelDispatch"
    >
      清除选择和路线
    </button>
  </div>

  <div style="display: none;" ref="stationPopupRef" class="dispatch-station-popup">
    <template v-if="activeStation">
      <header class="station-popup-header" :class="{ primary: activeStation.role === 'primary' }">
        <div>
          <span class="role-tag">
            {{ activeStation.role === 'primary' ? '主管' : '支撑' }}
          </span>
          <strong>{{ activeStation.name }}</strong>
        </div>
        <span class="distance">{{ formatDistance(activeStation.distanceMeters) }}</span>
      </header>
      <p class="station-address">{{ activeStation.address || '暂无地址' }}</p>
      <h4>车辆列表</h4>
      <p v-if="activeStation.vehiclesLoading">正在加载该队站车辆...</p>
      <p v-else-if="activeStation.vehiclesError" class="error-message">
        {{ activeStation.vehiclesError }}
        <button type="button" @click="service?.loadStationVehicles(activeStation.id)">重试</button>
      </p>
      <p v-else-if="!activeStation.vehicles.length">该队站暂无车辆</p>
      <label
        v-for="vehicle in activeStation.vehicles"
        :key="vehicle.id"
        class="vehicle-row"
        :class="{ dispatched: vehicle.dispatched }"
      >
        <input
          type="checkbox"
          :checked="vehicle.selected || vehicle.dispatched"
          :disabled="vehicle.dispatched || !isVehicleSelectable(vehicle)
            || activeStation.vehiclesLoading || state.status === 'dispatching'"
          @change="toggleVehicle(activeStation.id, vehicle.id, $event)"
        />
        <span class="vehicle-content">
          <strong>{{ vehicle.name }}</strong>
          <div class="vehicle-meta-grid">
            <small>
              {{ vehicle.plateNumber }} ·
              {{ vehicle.dispatched ? '已调派' : vehicleStatusText(vehicle) }}
            </small>
            <small>所属机构：{{ vehicleOrgName(vehicle) }}</small>
            <small
              >类型：{{ vehicle.type || '暂无' }} · 高度：{{ vehicle.vehicleHeightMeters == null ? '暂无' : `${vehicle.vehicleHeightMeters} 米` }}</small
            >
            <small>预计到达：{{ vehicleEtaText(vehicle, activeStation) }}</small>
          </div>
        </span>
      </label>
      <div
        v-if="routeDescription(activeStation)"
        class="route-message"
        :class="{ error: activeStation.routeStatus === 'error' }"
      >
        {{ routeDescription(activeStation) }}
      </div>
    </template>
  </div>

  <div ref="hydrantPopupRef" class="dispatch-t1-hydrant-popup">
    <template v-if="hydrantInfo">
      <header class="hydrant-popup-header">
        <strong>{{ hydrantInfo.title }}</strong>
        <button type="button" aria-label="关闭" @click="closeHydrantPopup">×</button>
      </header>
      <div class="hydrant-popup-body">
        <div v-for="row in hydrantInfo.rows" :key="row.label" class="hydrant-popup-row">
          <span>{{ row.label }}</span>
          <strong>{{ row.value }}</strong>
        </div>
      </div>
    </template>
  </div>

  <div v-if="state.status === 'querying'" class="dispatch-query-status">正在查询主管队站、辖区和支撑队站...</div>
  <!-- <div v-else-if="state.error" class="dispatch-query-status error-message">
    {{ state.error }}
  </div> -->
</template>

<style scoped>
.dispatch-global-actions {
  position: absolute;
  top: 18px;
  right: 22px;
  z-index: 1300;
  display: flex;
  gap: 10px;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--text-muted) 42%, transparent);
  border-radius: 10px;
  background: var(--panel-bg);
  box-shadow: 0 8px 24px color-mix(in srgb, #000 20%, transparent);
  backdrop-filter: blur(8px);
}

.dispatch-button,
.cancel-dispatch-button {
  min-width: 92px;
  padding: 9px 16px;
  border: 0;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.dispatch-button {
  background: var(--tag-danger-text);
  color: var(--text-primary);
}

.cancel-dispatch-button {
  border: 1px solid var(--text-muted);
  background: var(--panel-bg);
  color: var(--text-secondary);
}

.dispatch-button:disabled,
.cancel-dispatch-button:disabled {
  background: var(--panel-bg);
  color: var(--text-primary);
  cursor: not-allowed;
}

.dispatch-station-popup {
  position: relative;
  min-width: 380px;
  max-height: 330px;
  overflow-y: auto;
  padding: 14px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel-bg);
  box-shadow: 0 12px 30px color-mix(in srgb, #000 25%, transparent);
  color: var(--panel-bg-solid);
}

.dispatch-t1-hydrant-popup {
  position: relative;
  width: 320px;
  padding: 14px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel-bg);
  box-shadow: 0 12px 30px color-mix(in srgb, #000 25%, transparent);
  color: var(--panel-bg-solid);
}

.hydrant-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hydrant-popup-header button {
  width: 28px;
  height: 28px;
  border: 1px solid var(--text-muted);
  border-radius: 7px;
  background: var(--panel-bg);
  color: var(--text-secondary);
  cursor: pointer;
}

.hydrant-popup-body {
  margin-top: 10px;
}

.hydrant-popup-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 10px;
  padding: 4px 0;
  font-size: 13px;
}

.hydrant-popup-row span {
  color: var(--text-muted);
}

.hydrant-popup-row strong {
  overflow-wrap: anywhere;
  font-weight: 500;
}

.station-popup-header,
.station-popup-header > div,
.vehicle-row {
  display: flex;
  align-items: center;
}

.station-popup-header {
  justify-content: space-between;
  gap: 12px;
}

.station-popup-header > div {
  min-width: 0;
  gap: 8px;
}

.station-popup-header strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-tag {
  flex: 0 0 auto;
  min-width: 24px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--panel-bg);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.4;
  text-align: center;
  white-space: nowrap;
  writing-mode: horizontal-tb;
}

.station-popup-header.primary .role-tag {
  background: var(--tag-danger-bg);
  color: var(--tag-danger-text);
}

.station-address {
  margin: 9px 0 12px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}

.distance {
  color: var(--text-muted);
  font-size: 12px;
}

.dispatch-station-popup h4 {
  margin: 0 0 7px;
  color: var(--text-secondary);
  font-size: 13px;
}

.vehicle-row {
  gap: 9px;
  padding: 8px;
  border-radius: 6px;
  background: var(--panel-bg);
  cursor: pointer;
}

.vehicle-row + .vehicle-row {
  margin-top: 5px;
}

.vehicle-row.dispatched {
  opacity: 0.62;
}

.vehicle-content,
.vehicle-content strong {
  display: block;
}

.vehicle-content strong {
  font-size: 13px;
}

.vehicle-meta-grid {
  display: grid;
  grid-template-columns: auto auto;
  gap: 2px 12px;
  margin-top: 2px;
}

.vehicle-meta-grid small {
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.route-message {
  margin-top: 8px;
  padding: 9px 12px;
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--accent-cyan);
  font-size: 12px;
}

.error-message,
.route-message.error {
  color: var(--tag-danger-text);
}

.dispatch-query-status {
  position: absolute;
  top: 82px;
  right: 22px;
  z-index: 1300;
  padding: 9px 13px;
  border-radius: 6px;
  background: var(--panel-bg);
  box-shadow: 0 5px 16px color-mix(in srgb, #000 16%, transparent);
  color: var(--accent-cyan);
  font-size: 13px;
}

@media (max-width: 640px) {
  .dispatch-global-actions {
    top: 10px;
    right: 10px;
  }

  .dispatch-station-popup {
    width: min(310px, calc(100vw - 30px));
  }
}
</style>
