import { createApp, App } from "vue";
import Map from "ol/Map";
import Overlay from "ol/Overlay";
import VectorLayer from "ol/layer/Vector";
import TileLayer from "ol/layer/Tile";
import TileWMS from "ol/source/TileWMS";
import AlarmDetailPopup from "./AlarmDetailPopup.vue";
import { geoserverApi } from "@/service/geoserver";
import { unByKey } from "ol/Observable";
import { EventsKey } from "ol/events";
import { transform } from "ol/proj";
import { useLayersStore, usePanelStore } from "@/store";
import { ALL_RESOURCE_TYPES } from "@/components/map/MapTools";
import { calculateDistance } from "@/utils/mapTool.ts";
import { STATION_LAYER_NAME } from "@/controller/core/business/IncidentStationQuery";

/** 主管队站独立 zhu.png 图标图层 className（dispatchMap 警情定位链路） */
export const INCIDENT_PRIMARY_STATION_LAYER_CLASS = "INCIDENT_PRIMARY_STATION_LAYER";
/**
 * 警情周边资源范围圈（可拖拽 500 米圆）图层 className。
 * 该图层为半透明装饰面，点击命中时不应拦截 WMS 要素弹窗，
 * 故 FeatureClickQuery 的矢量命中过滤需显式排除它。
 */
export const RESOURCE_CIRCLE_LAYER_CLASS = "nearby_resource_circle_layer";
/** 主管队站独立 zhu.png 图标图层 className（DispatchT1 立案调派链路） */
export const DISPATCH_T1_PRIMARY_STATION_LAYER_CLASS = "dispatch_t1_primary_station";
/** 主管队站独立图标图层集合：点击命中时直接复用队站 WMS 弹窗，内容与支撑队站一致 */
export const PRIMARY_STATION_LAYER_CLASSES = new Set<string>([
  INCIDENT_PRIMARY_STATION_LAYER_CLASS,
  DISPATCH_T1_PRIMARY_STATION_LAYER_CLASS,
]);

export class FeatureClickQuery {
  private map: Map;
  private overlay: Overlay;
  private overlayElement: HTMLElement;
  private vueApp: App | null = null;
  private clickListener: EventsKey | null = null;
  private openStationId: string | null = null;

  constructor(
    map: Map,
    private readonly getStationRouteInfo?: (stationId: string) => {
      etaText: string;
      distanceText: string;
    } | null,
  ) {
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

  public close() {
    this.closePopup();
  }

  public getOpenStationId() {
    return this.openStationId;
  }

  public showStation(station: {
    id: string;
    name: string;
    address: string;
    coordinate: number[];
  }) {
    this.showPopup(station.coordinate, {
      id: `${STATION_LAYER_NAME}.${station.id}`,
      properties: {
        id: station.id,
        org_name: station.name,
        org_address: station.address,
      },
    }, useLayersStore().items);
    this.overlayElement.dataset.stationPopup = "true";
  }

  private async handleMapClick(evt: any) {
    // 主管队站独立 zhu.png 图标为矢量图层，WMS GetFeatureInfo 按像素查不到；
    // 命中主管要素时直接复用队站弹窗（机构名称/地址/预计时间/导航距离），与支撑队站一致
    const primaryStationFeature = this.map.forEachFeatureAtPixel(
      evt.pixel,
      (feature, layer) =>
        layer instanceof VectorLayer
          && PRIMARY_STATION_LAYER_CLASSES.has(layer.getClassName())
          ? feature
          : undefined,
      { hitTolerance: 6 },
    ) as any | undefined;
    if (primaryStationFeature) {
      const data = (primaryStationFeature.get("data") ?? {}) as {
        stationId?: string;
        name?: string;
        address?: string;
      };
      const stationId = String(
        data.stationId ?? primaryStationFeature.get("stationId") ?? "",
      ).trim();
      const geometry = primaryStationFeature.getGeometry();
      if (stationId && geometry) {
        this.showStation({
          id: stationId,
          name: data.name ?? "",
          address: data.address ?? "暂无地址",
          coordinate: geometry.getCoordinates(),
        });
        return;
      }
    }

    // 消防站 WMS 位于路线之上时，路线矢量仍可被像素命中；先查实际可见的队站。
    const stationVectorHit = this.map.hasFeatureAtPixel(evt.pixel, {
      hitTolerance: 6,
      layerFilter: (layer) => layer instanceof VectorLayer
        && layer.getClassName() === "FIRE_STATIONS_LAYER",
    });
    if (stationVectorHit) {
      this.closePopup();
      return;
    }
    if (await this.showStationPopupAt(evt.coordinate)) return;

    // 点击命中矢量标注图层（警情/队站/车辆等前端要素层）时，
    // 本次点击交由对应矢量图层自己的点击处理，不再发起 WMS 要素查询，
    // 避免点位下方的 WMS 要素（如重点单位）弹窗叠加弹出。
    // 排除周边资源范围圈：它是覆盖整个圈的半透明装饰面（非业务点位），
    // 不排除会导致圈内所有点击（含消防栓/重点单位 WMS 要素）都被拦截而弹不出窗。
    const hitVector = this.map.hasFeatureAtPixel(evt.pixel, {
      hitTolerance: 6,
      layerFilter: (layer) =>
        layer instanceof VectorLayer
        && layer.getClassName() !== RESOURCE_CIRCLE_LAYER_CLASS,
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
    const layerIds = checkedIds.value.filter((id) => {
      const item = items.value.find((config) => config.id === id)
      return item && !item.useWebMock && !item.noEsSearch
    });

    const panelStore = usePanelStore()

    const queryLayers = [
      "gis:mapresource", //ES
      ...layerIds,
      ...(panelStore.circleOpen ? ALL_RESOURCE_TYPES.map(({ layerName }) => layerName) : []),
    ];

    if (!queryLayers.length) {
      this.closePopup();
      return;
    }

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

  private async showStationPopupAt(coordinate: number[]): Promise<boolean> {
    const stationLayer = this.map.getLayers().getArray().find((layer) =>
      layer instanceof TileLayer
      && layer.getVisible()
      && (this.map.getView().getZoom() ?? 0) >= layer.getMinZoom()
      && layer.getSource() instanceof TileWMS
      && layer.getSource()?.getParams().LAYERS === STATION_LAYER_NAME,
    ) as TileLayer<TileWMS> | undefined;
    const source = stationLayer?.getSource();
    if (!source) return false;

    const view = this.map.getView();
    const projection = view.getProjection();
    const url = source.getFeatureInfoUrl(
      coordinate,
      view.getResolution() ?? 0,
      projection,
      { INFO_FORMAT: "application/json", FEATURE_COUNT: 1 },
    );
    if (!url) return false;

    try {
      const params = new URL(url, window.location.origin).searchParams;
      const data = await geoserverApi.getWMSFeatureInfo("gis", {
        layers: STATION_LAYER_NAME,
        query_layers: STATION_LAYER_NAME,
        bbox: params.get("BBOX") ?? params.get("bbox") ?? "",
        width: Number(params.get("WIDTH") ?? params.get("width")),
        height: Number(params.get("HEIGHT") ?? params.get("height")),
        x: Number(params.get("X") ?? params.get("x") ?? params.get("I") ?? params.get("i")),
        y: Number(params.get("Y") ?? params.get("y") ?? params.get("J") ?? params.get("j")),
        cql_filter: String(source.getParams().CQL_FILTER ?? "1=1"),
        feature_count: 1,
        srs: projection.getCode(),
      });
      const feature = data?.features?.[0];
      if (!feature) return false;
      this.showPopup(coordinate, feature, useLayersStore().items);
      this.overlayElement.dataset.stationPopup = "true";
      return true;
    } catch (error) {
      console.error("Failed to query fire station:", error);
      return false;
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
      org_address: "机构地址",
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

    let rows = Object.keys(properties)
      .filter((key) => key !== "bbox" && keys[key])
      .map((key) => ({
        label: keys[key],
        value: properties[key],
      }));

    const isStation = String(fId).includes('view_res_org_dept') || Boolean(properties.org_name);
    const stationId = String(properties.id ?? String(fId).split('.').pop() ?? '').trim();
    const routeInfo = isStation && stationId ? this.getStationRouteInfo?.(stationId) : null;
    if (routeInfo) {
      rows = [
        { label: '机构名称', value: properties.org_name || '暂无' },
        { label: '机构地址', value: properties.org_address || '暂无地址' },
        { label: '预计时间', value: routeInfo.etaText },
        { label: '导航距离', value: routeInfo.distanceText },
      ];
    }

    const title = properties.org_name || item.name || item.title || properties.name || properties.mc || properties.NAME || properties.MC || "详细信息";

    this.vueApp = createApp(AlarmDetailPopup, {
      visible: true,
      title: title,
      rows: rows,
      onClose: () => this.closePopup(),
    });

    this.vueApp.mount(this.overlayElement);
    this.overlay.setPosition(coordinate);
    this.openStationId = isStation ? stationId : null;
    if (isStation) this.overlayElement.dataset.stationPopup = "true";
  }

  private closePopup() {
    this.openStationId = null;
    delete this.overlayElement.dataset.stationPopup;
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
