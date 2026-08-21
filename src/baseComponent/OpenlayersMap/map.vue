<script setup lang="ts">
import { onMounted, nextTick, onUnmounted, ref, watch, markRaw } from "vue";
import OLMap from "ol/Map";
import View from "ol/View";
import * as olProj from "ol/proj";
import { unByKey } from "ol/Observable";
import type { EventsKey } from "ol/events";
import TileLayer from "ol/layer/Tile";
import { ScaleLine, OverviewMap } from "ol/control";
// import { KeyboardPan } from "ol/interaction";
import PrintDialog from "ol-ext/control/PrintDialog";
import jsPDF from "jspdf";
import { saveAs } from "file-saver";
import { v4 as uuidv4 } from "uuid";
import { FeatureClickQuery } from "./FeatureClickQuery.ts";
import { useExtent } from "@/components/map/MapTools/commonTools/useExtent.ts";
import {
  AMAP_LAYER,
  GOOGLE_LAYER,
  TEMP_FRONTEND_LAYER_IDS,
  VECTOR_LAYER,
  isTempFrontendLayerId,
} from "./layers.ts";
import { TrafficTools } from "../../components/map/MapTools";
import { ZOOM, CENTER } from "./const.map.ts";
import { useResponsive } from "../../composables/useResponsive.ts";
import {
  AmapRealtimeNav,
  mountFireStations,
  mountJRAlarmLayer,
} from "../amap/useAmapTools.ts";
import { mountCarFeatures } from "@/composables/useCarFeatures";
import { mountSSRKFeatures } from "@/composables/useSSRKFeatures";
import { mountIncomingCallFeatures } from "@/composables/useIncomingCallFeatures";
import amapData from "../amap/data.json";
import carImg from "../amap/imgs/car.png";
import fireImg from "../amap/imgs/xfz.png";
import { zhxfdzXYList } from "../amap/mapData.ts";
import { useAlarmHotspot } from "@/composables/useAlarmHotspot";
import { EventBus } from "../../util/mitt.ts";
import AlarmDetailPopup from "./AlarmDetailPopup.vue";
import ZoomLevelControl from "./ZoomLevelControl.vue";
import { useBaseSourceStore, useCommonStore, useTabsStore } from "@/store";
import { THEME_COLOR } from "../../const/const.common.ts";
import { createBaseSourceSource } from "./baseSource.ts";
import { storeToRefs } from "pinia";
import { addrCtrl, onPOIRequest, onRouteRequest } from "@/controller/map";
import {
  IOController,
  GenericController,
  BusinessController,
} from "@/controller/core";
import TileWMS from "ol/source/TileWMS";
import { getWMSLayerOptions } from "@/apis/layers";
import { useLayersStore } from "@/store/useLayersStore";

import NavPanel from "./NavPanel.vue";
import { useMapPopups, carTypeLabel, carStatusLabel } from "./useMapPopups.ts";
// import { getLayerByClassName } from "@/util/mapTool.ts";

const props = withDefaults(defineProps<{ mapId?: string; }>(), { mapId: "map" });
const emit = defineEmits(["setMap"]);

const { isMobile } = useResponsive();

let map: OLMap | null = null;
let nav: AmapRealtimeNav | null = null;
let zoomLevelChangeKey: EventsKey | null = null;
const mapZoomLevel = ref(ZOOM.INIT);

const navPanelRef = ref<InstanceType<typeof NavPanel> | null>(null);

// == 抽离出的 Popups 管理 ==
const popups = useMapPopups();
const { carPopupRef } = popups;

const getCarPopupElement = () => {
  if (carPopupRef.value) return carPopupRef.value;
  const fallback = document.createElement('div');
  fallback.style.display = 'none';
  document.body.appendChild(fallback);
  carPopupRef.value = fallback;
  return fallback;
};

const showOnlineCarLayer = async () => {
  if (!carManager) return;
  carManager.setVisible(true);
  await carManager.fetch();
  carManager.fitToExtent();
};

let carManager: any = null;
let ssrkManager: any = null;
let incomingCallManager: any = null;
let fireManager: any = null;
let alarmOverlayManager: any = null;
let jrAlarmManager: any = null;
let featureClickQuery: FeatureClickQuery | null = null;
let ioCtrl: IOController | null = null;
let genericCtrl: GenericController | null = null;
let trafficTool: TrafficTools | null = null;

const layersStore = useLayersStore();
const baseSourceStore = useBaseSourceStore();
const commonStore = useCommonStore();
const { alarms: alarmHotspots, fetch: fetchAlarmHotspots } = useAlarmHotspot();
const { themeColor } = storeToRefs(commonStore);
const wmsLayerMap = new globalThis.Map<string, TileLayer<TileWMS>>();
let baseLayer: TileLayer | null = null;
let overviewLayer: TileLayer | null = null;

const syncBaseSourceLayer = () => {
  if (!baseLayer) return;
  const source = createBaseSourceSource(
    baseSourceStore.activeId,
    {
      night: themeColor.value === THEME_COLOR.NIGHT,
    },
    (maxZoom: number) => nextTick(() => map?.getView().setMaxZoom(maxZoom)),
  );

  baseLayer.setSource(source);
  if (overviewLayer) overviewLayer.setSource(source);
};

watch(
  [() => baseSourceStore.activeId, () => themeColor.value],
  syncBaseSourceLayer,
);
watch(
  () => baseSourceStore.trafficVisible,
  (v) => trafficTool?.setVisible(v),
);
watch(alarmHotspots, (next) => jrAlarmManager?.setData?.(next));

const addLayer = (id: string, visible?: boolean) => {
  if (!map) return;
  if (isTempFrontendLayerId(id)) return setTempFrontendLayerVisible(id, true);
  const config = layersStore.getConfig(id);
  if (!config || wmsLayerMap.has(id)) return;
  const options = getWMSLayerOptions(config);
  const wmsLayer = new TileLayer({
    source: new TileWMS({
      url: options.url,
      params: options.params,
      serverType: options.serverType,
      crossOrigin: options.crossOrigin,
    }),
    opacity: options.opacity,
  });
  map.addLayer(wmsLayer);
  wmsLayer.set('id', id);
  wmsLayer.setVisible(visible ?? config.visible ?? true);
  wmsLayerMap.set(id, wmsLayer);
  return true;
};

const removeLayer = (id: string) => {
  if (!map) return false;
  if (isTempFrontendLayerId(id)) return setTempFrontendLayerVisible(id, false);
  const layer = wmsLayerMap.get(id);
  if (!layer) return;
  map.removeLayer(layer);
  wmsLayerMap.delete(id);
  return true;
};

const visibleLayer = (id: string, bol: boolean) => {
  if (!map) return;
  wmsLayerMap.get(id)?.setVisible(bol);
  // getLayerByClassName(map, id)?.setVisible(bol);
}

const syncLayers = (ids: string[], visible?: boolean) => {
  
  const targetIds = new Set(ids);

  Array.from(wmsLayerMap.keys()).forEach((id) => {
    if (!targetIds.has(id)) removeLayer(id);
  });
  
  Object.values(TEMP_FRONTEND_LAYER_IDS).forEach((id) =>
    targetIds.has(id) && setTempFrontendLayerVisible(id, targetIds.has(id)),
  );
  
  ids.forEach((id) => {
    if (!isTempFrontendLayerId(id)) addLayer(id, visible);
  });
};

defineExpose({ addLayer, removeLayer, syncLayers, visibleLayer });

const setTempFrontendLayerVisible = (id: string, visible: boolean) => {
  if (id === TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR && carManager) {
    if (visible) void showOnlineCarLayer();
    else carManager.setVisible(false);
    return true;
  }

  const managerMap: Record<string, any> = {
    [TEMP_FRONTEND_LAYER_IDS.STATION]: fireManager,
    [TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER]: jrAlarmManager,
    [TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR]: carManager,
    [TEMP_FRONTEND_LAYER_IDS.INCOMING_CALL]: incomingCallManager,
    [TEMP_FRONTEND_LAYER_IDS.SSRK]: ssrkManager,
  };
  const manager = managerMap[id];
  if (!manager) return false;
  manager.setVisible(visible);
  if (visible) {
    if (id === TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER) fetchAlarmHotspots();
  }
  return true;
};

const updateMapZoomLevel = () => {
  const zoom = map?.getView().getZoom();
  if (typeof zoom === "number") mapZoomLevel.value = zoom;
};

const mapMessageUnsubscribers: Array<() => void> = [];
const configList = Array.isArray(amapData)
  ? (amapData as any[])
  : [amapData as any];
const regionCfg = (configList[0] || {}).data || configList[0];

const onFatherMessage = async (
  coord: [number, number],
  otherData: any,
  fireBrigade = [],
  d?: any,
) => {
  useTabsStore().setActiveTab(1);
  popups.alarmData.value = otherData || null;
  if (navPanelRef.value) {
    navPanelRef.value.endCoord = coord;
    navPanelRef.value.startSimulate(fireBrigade, d);
    const address = await nav?.reverseGeocode(coord);
    navPanelRef.value.endText = address || "";
  }
  EventBus.emit("panelClose");
};

const initMap = () => {
  baseLayer = AMAP_LAYER();
  overviewLayer = AMAP_LAYER();
  syncBaseSourceLayer();

  map = 
    new OLMap({
      layers: [baseLayer, GOOGLE_LAYER, VECTOR_LAYER()],
      target: props.mapId,
      view: new View({
        center: olProj.fromLonLat(CENTER),
        zoom: ZOOM.INIT,
        minZoom: ZOOM.MIN,
        maxZoom: ZOOM.MAX,
      }),
    });
    
    // TODO: 使用注册中心 接收源（服务|辖区围栏around|机构围栏around|客户区划围栏around）extent变化
    // const extent = map.getView().calculateExtent(map.getSize());
    const extent = [113.713367, 22.4543543, 114.633333, 22.8667432];  // 临时限制
    useExtent(map, extent)

  // 全量预注册wms图层（需要预处理时开启）
  // layersStore.layerConfigs.forEach(({ id }) => {
  //     addLayer(id, false);
  // })

  genericCtrl = new GenericController(map);
  const businessCtrl = new BusinessController(genericCtrl);
  ioCtrl = new IOController(genericCtrl, businessCtrl);

  updateMapZoomLevel();
  zoomLevelChangeKey = map
    .getView()
    .on("change:resolution", updateMapZoomLevel);
  featureClickQuery = new FeatureClickQuery(map);
  featureClickQuery.activate();

  map.addControl(
    new OverviewMap({
      layers: [overviewLayer],
      collapsed: false,
      collapsible: true,
    }),
  );
  map.addControl(new ScaleLine());

  if (!isMobile.value) {
    const printControl = new PrintDialog({ lang: "zh" });
    printControl.setSize("A4");
    printControl.on(["print", "error"], (e: any) => {
      if (e.image) {
        const uuid = uuidv4().replace(/-/g, "");
        if (e.pdf) {
          const pdf = new jsPDF({
            orientation: e.print.orientation,
            unit: e.print.unit,
            format: e.print.size,
          });
          pdf.addImage(
            e.image,
            "JPEG",
            e.print.position[0],
            e.print.position[0],
            e.print.imageWidth,
            e.print.imageHeight,
          );
          pdf.save(e.print.legend ? "legend.pdf" : `openlayers_${uuid}.pdf`);
        } else {
          e.canvas.toBlob(
            (blob: any) =>
              saveAs(
                blob,
                (e.print.legend ? "legend." : `map_${uuid}.`) +
                  e.imageType.replace("image/", ""),
              ),
            e.imageType,
            e.quality,
          );
        }
      }
    });
  }

  nav = new AmapRealtimeNav(map, {
    amapKey: "7405ae6dde247ee87be4e7d8021056f4",
    xzKeywords: (regionCfg?.adcode as string) || "",
    vehicleIconSrc: carImg,
  });
  (window as any).nav = nav;
  // nav.loadMask((regionCfg?.boundaries as any) || []).catch(() => {});

  if (popups.firePopupRef.value) {
    fireManager = mountFireStations({
      map,
      stations: zhxfdzXYList as any,
      iconSrc: fireImg,
      popupElement: popups.firePopupRef.value,
      visible: layersStore.checkedIds.includes(TEMP_FRONTEND_LAYER_IDS.STATION),
      onSelect: (d) => {
        popups.fireSelected.value = d;
        popups.firePopupVisible.value = true;
      },
      onClose: () => {
        popups.closeFirePopup();
      },
    });
  }

  ssrkManager = mountSSRKFeatures({
    map,
    visible: layersStore.checkedIds.includes(TEMP_FRONTEND_LAYER_IDS.SSRK),
  });
  
  carManager = mountCarFeatures({
    map,
    popupElement: getCarPopupElement(),
    visible: layersStore.checkedIds.includes(TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR),
    onSelect: (d) => {
      popups.carSelected.value = d;
      popups.carPopupVisible.value = true;
    },
    onClose: () => {
      popups.closeCarPopup();
    },
  });
  carManager.layer.set('id', TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR);
  genericCtrl?.view.registerLayerToggleCallback(
    TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR,
    (visible) => {
      if (visible) void showOnlineCarLayer();
      else carManager?.setVisible(false);
    },
  );
  genericCtrl?.view.registerLayerRefreshCallback(
    TEMP_FRONTEND_LAYER_IDS.ONLINE_CAR,
    () => {
      void carManager?.fetch();
    },
  );

  incomingCallManager = mountIncomingCallFeatures({
    map,
    visible: layersStore.checkedIds.includes(
      TEMP_FRONTEND_LAYER_IDS.INCOMING_CALL,
    ),
  });

  if (popups.alarmPopupRef.value && nav) {
    alarmOverlayManager = nav.mountAlarmOverlay({
      element: popups.alarmPopupRef.value,
      onUpdate: (d) => {
        popups.alarmData.value = d;
        popups.alarmPopupVisible.value = !!d;
      },
    });
  }

  if (popups.jrAlarmPopupRef.value) {
    jrAlarmManager = mountJRAlarmLayer({
      map,
      alarms: [],
      popupElement: popups.jrAlarmPopupRef.value,
      visible: layersStore.checkedIds.includes(
        TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER,
      ),
      onSelect: (d) => {
        popups.jrAlarmData.value = d;
        popups.jrAlarmPopupVisible.value = true;
      },
      onClose: () => {
        popups.closeJRAlarmPopup();
      },
    });
  }

  // syncLayers(layersStore.checkedIds);
  trafficTool = new TrafficTools(map);
  trafficTool.setVisible(baseSourceStore.trafficVisible);

  ioCtrl.input.initSubscriptions();

  emit("setMap", map);
};

const cleanup = () => {
  if (zoomLevelChangeKey) {
    unByKey(zoomLevelChangeKey);
    zoomLevelChangeKey = null;
  }
  if (featureClickQuery) {
    featureClickQuery.destroy();
    featureClickQuery = null;
  }
  alarmOverlayManager?.destroy();
  jrAlarmManager?.destroy();
  carManager?.destroy();
  incomingCallManager?.destroy();
  fireManager?.destroy();
  if (nav) {
    nav.destroy();
    nav = null;
  }
  if (trafficTool) {
    trafficTool.remove();
    trafficTool = null;
  }
  if (ioCtrl) {
    ioCtrl.input.destroy();
    ioCtrl = null;
  }
  if (map) {
    wmsLayerMap.forEach((layer) => map?.removeLayer(layer));
    wmsLayerMap.clear();
    map.dispose();
    map = null;
  }
};

onMounted(() => {
  nextTick(() => initMap());
  mapMessageUnsubscribers.push(
    onRouteRequest((d: any) =>
      onFatherMessage(
        [d.alarmData.gisX, d.alarmData.gisY],
        d.alarmData.info,
        d.fireBrigade,
        d,
      ),
    ),
    addrCtrl.receive(({ status }: { status: boolean }) => {
      if (typeof status !== "boolean") return;
      if (!status && navPanelRef.value) (navPanelRef.value as any).clearNav();
    }),
  );
});

onUnmounted(() => {
  mapMessageUnsubscribers.splice(0).forEach((unsub) => unsub());
  cleanup();
});
</script>

<template>
  <div :id="props.mapId" :class="{ 'is-mobile': isMobile }" tabindex="2">
    <ZoomLevelControl :zoom="mapZoomLevel" />

    <div
      ref="popups.firePopupRef"
      class="fire_popup"
      v-show="popups.firePopupVisible.value"
    >
      <div class="fire_popup_header">
        <div class="fire_popup_title">
          {{ popups.fireSelected.value?.title }}
        </div>
        <button
          class="fire_popup_close"
          type="button"
          @click="popups.closeFirePopup"
        >
          ×
        </button>
      </div>
      <div class="fire_popup_body">
        <div v-if="popups.fireSelected.value?.address" class="fire_popup_row">
          <span class="fire_popup_k">地址</span
          ><span class="fire_popup_v">{{
            popups.fireSelected.value.address
          }}</span>
        </div>
        <div v-if="popups.fireSelected.value?.phone" class="fire_popup_row">
          <span class="fire_popup_k">电话</span
          ><span class="fire_popup_v">{{
            popups.fireSelected.value.phone
          }}</span>
        </div>
        <div class="fire_popup_row">
          <span class="fire_popup_k">坐标</span
          ><span class="fire_popup_v"
            >{{ popups.fireSelected.value?.lng }},
            {{ popups.fireSelected.value?.lat }}</span
          >
        </div>
      </div>
    </div>

    <div ref="popups.alarmPopupRef">
      <AlarmDetailPopup
        :visible="popups.alarmPopupVisible.value"
        :title="popups.alarmPopupTitle.value"
        :rows="popups.alarmPopupRows.value"
        @close="popups.closeAlarmPopup"
      />
    </div>

    <div ref="popups.jrAlarmPopupRef">
      <AlarmDetailPopup
        :visible="popups.jrAlarmPopupVisible.value"
        :title="popups.jrAlarmPopupTitle.value"
        :rows="popups.jrAlarmPopupRows.value"
        @close="popups.closeJRAlarmPopup"
      />
    </div>

    <div
      :ref="(el) => { carPopupRef = el as HTMLElement | null }"
      class="car_popup"
      v-show="popups.carPopupVisible.value"
    >
      <div class="car_popup_header">
        <div class="car_popup_title">
          {{ popups.carSelected.value?.plateNo }} -
          {{ popups.carSelected.value?.team }}
        </div>
        <button
          class="car_popup_close"
          type="button"
          @click="popups.closeCarPopup"
        >
          ×
        </button>
      </div>
      <div class="car_popup_body">
        <div class="car_popup_row">
          <span class="car_popup_k">车辆类型</span
          ><span class="car_popup_v">{{
            carTypeLabel(popups.carSelected.value?.carType)
          }}</span>
        </div>
        <div class="car_popup_row">
          <span class="car_popup_k">状态</span
          ><span class="car_popup_v">{{
            carStatusLabel(popups.carSelected.value?.status)
          }}</span>
        </div>
        <div v-if="popups.carSelected.value?.driver" class="car_popup_row">
          <span class="car_popup_k">司机</span
          ><span class="car_popup_v">{{
            popups.carSelected.value.driver
          }}</span>
        </div>
        <div class="car_popup_row">
          <span class="car_popup_k">坐标</span
          ><span class="car_popup_v">{{
            popups.formatCoordinateText(
              popups.carSelected.value?.lng,
              popups.carSelected.value?.lat,
            )
          }}</span>
        </div>
      </div>
    </div>

    <NavPanel
      ref="navPanelRef"
      :nav="nav"
      :alarmData="popups.alarmData.value"
      @clear="
        popups.closeAlarmPopup();
        EventBus.emit('panelClose');
      "
    />
  </div>
</template>

<style scoped lang="less">
@import "./map.less";
</style>
