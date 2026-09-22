import { createApp, App } from "vue";
import Map from "ol/Map";
import Overlay from "ol/Overlay";
import VectorLayer from "ol/layer/Vector";
import TileWMS from "ol/source/TileWMS";
import AlarmDetailPopup from "./AlarmDetailPopup.vue";
import { geoserverApi } from "@/service/geoserver";
import { unByKey } from "ol/Observable";
import { EventsKey } from "ol/events";
import { transform } from "ol/proj";
import { useLayersStore, usePanelStore } from "@/store";
import { ALL_RESOURCE_TYPES } from "@/components/map/MapTools";
import { calculateDistance } from "@/utils/mapTool.ts";

export class FeatureClickQuery {
  private map: Map;
  private overlay: Overlay;
  private overlayElement: HTMLElement;
  private vueApp: App | null = null;
  private clickListener: EventsKey | null = null;

  constructor(map: Map) {
    this.map = map;
    this.overlayElement = document.createElement("div");
    this.overlay = new Overlay({
      element: this.overlayElement,
      autoPan: {
        animation: {
          duration: 250,
        },
      },
      positioning: "bottom-center",
      offset: [0, -15],
    });
  }

  public activate() {
    if (this.clickListener) return;
    this.map.addOverlay(this.overlay);
    this.clickListener = this.map.on("singleclick", this.handleMapClick.bind(this));
  }

  public deactivate() {
    if (!this.clickListener) return;
    unByKey(this.clickListener);
    this.clickListener = null;
    this.map.removeOverlay(this.overlay);
    this.closePopup();
  }

  private async handleMapClick(evt: any) {
    // 点击命中矢量标注图层（警情/队站/车辆等前端要素层）时，
    // 本次点击交由对应矢量图层自己的点击处理，不再发起 WMS 要素查询，
    // 避免点位下方的 WMS 要素（如重点单位）弹窗叠加弹出。
    const hitVector = this.map.hasFeatureAtPixel(evt.pixel, {
      hitTolerance: 6,
      layerFilter: (layer) => layer instanceof VectorLayer,
    });
    if (hitVector) {
      this.closePopup();
      // return;
    }

    const view = this.map.getView();
    const resolution: number = view.getResolution() ?? 0;
    const projection = view.getProjection();

    const layersStore = useLayersStore()
    const { checkedIds, items } = storeToRefs(layersStore)
    const layerIds = checkedIds.value.filter((item) => {
      const { useWebMock, noEsSearch }: any = items.value.find(({ id }) => id === item)
      return !useWebMock && !noEsSearch
    });

    const panelStore = usePanelStore()

    const queryLayers = [
      "gis:mapresource", //ES
      ...layerIds,
      ...(panelStore.circleOpen ? ALL_RESOURCE_TYPES.map(({ layerName }) => layerName) : []),
    ];

    const dummySource = new TileWMS({
      url: geoserverApi.getWMSServiceUrl("gis"),
      params: { LAYERS: queryLayers.join(","), VERSION: "1.1.0" },
    });

    const url = dummySource.getFeatureInfoUrl(evt.coordinate, resolution, projection, {
      INFO_FORMAT: "application/json",
      FEATURE_COUNT: 20,
    });

    if (url) {
      try {
        const urlObj = new URL(url, window.location.origin);
        const data = await geoserverApi.getWMSFeatureInfo("gis", {
          layers: queryLayers.join(","),
          query_layers: queryLayers.join(","),
          bbox: urlObj.searchParams.get("BBOX") || urlObj.searchParams.get("bbox") || "",
          width: Number(urlObj.searchParams.get("WIDTH") || urlObj.searchParams.get("width")),
          height: Number(urlObj.searchParams.get("HEIGHT") || urlObj.searchParams.get("height")),
          x: Number(urlObj.searchParams.get("X") || urlObj.searchParams.get("x") || urlObj.searchParams.get("I") || urlObj.searchParams.get("i")),
          y: Number(urlObj.searchParams.get("Y") || urlObj.searchParams.get("y") || urlObj.searchParams.get("J") || urlObj.searchParams.get("j")),
          cql_filter: Array(queryLayers.length).fill("1=1").join(";"),
          viewparams: Array(queryLayers.length).fill("1=1").join(","),
          feature_count: Number(urlObj.searchParams.get("FEATURE_COUNT") || 20),
          transparent: true,
          format: "image/png",
          srs: projection.getCode(),
        });

        if (data?.features?.length > 0) {
          this.showPopup(evt.coordinate, data.features[0], items.value);
        } else {
          this.closePopup();
        }
      } catch (error) {
        console.error("Failed to fetch feature info via alova:", error);
      }
    }
  }

  private showPopup(coordinate: number[], feature: any, items: any[]) {
    this.closePopup();

    const properties = feature.properties || {};
    const fId = feature.id || '';
    const item = items.find(({ id }) => id.includes(fId.split(".")[0] || "")) || {}; // 存在数据不一致情况
    // const item = items.find(({ id }) => fId.includes(id.split(":")[1] || "")) || {};

    const { circleOpen, circleCenter } = usePanelStore()
    if (circleOpen && circleCenter && circleCenter.length > 1) {
      const coord = transform(
        feature.geometry.coordinates,
        "EPSG:3857",
        "EPSG:4326"
      );
      properties.R_distance = calculateDistance(
        coord as any,
        circleCenter as any,
      ) + "米"
    }

    // 临时表头集合(多图源)
    const keys = {
      // 聚合查询相关
      name: "名称",
      address: "地址",

      // 消防栓相关
      symc: "水源名称",
      sydz: "水源地址",
      sylx: "水源类型",
      // gjzt: "告警状态",

      // 机构相关
      org_name: "机构名称",
      org_simple: "机构简称",
      contacter_name: "联系人",
      contacter_phone: "联系电话",
      dispatch_phone: "调度电话",
      org_desc: "机构描述",

      // 重点单位相关
      dept_name: "单位名称",
      branch_type: "单位类型",
      dept_phone: "单位电话",
      responsible_name: "联系人",
      address_cn: "单位地址",
      R_distance: "距圆心",
    } as any

    const rows = Object.keys(properties)
      .filter((key) => key !== "bbox" && keys[key])
      .map((key) => ({
        label: keys[key],
        value: properties[key],
      }));

    const title = item.name || item.title || properties.name || properties.mc || properties.NAME || properties.MC || "详细信息";

    this.vueApp = createApp(AlarmDetailPopup, {
      visible: true,
      title: title,
      rows: rows,
      onClose: () => this.closePopup(),
    });

    this.vueApp.mount(this.overlayElement);
    this.overlay.setPosition(coordinate);
  }

  private closePopup() {
    if (this.vueApp) {
      this.vueApp.unmount();
      this.vueApp = null;
    }
    this.overlay.setPosition(undefined);
  }

  public destroy() {
    this.deactivate();
  }
}
