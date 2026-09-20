import { markRaw } from "vue";
import { Draw, Modify } from "ol/interaction";
import ImageLayer from "ol/layer/Image";
import ImageWMS from "ol/source/ImageWMS";
import { getDistance } from "ol/sphere";
import { transform } from "ol/proj";
import { Circle } from "ol/geom";
import { BaseTool } from "./BaseTool";
import Map from "ol/Map";
import { Type } from "ol/geom/Geometry";
import { Coordinate } from "ol/coordinate";
import Feature from "ol/Feature";
import { Style, Stroke, Fill } from "ol/style";
import { unByKey } from "ol/Observable";
import { EventsKey } from "ol/events";
import Overlay from "ol/Overlay";
import { geoserverApi } from "@/service/geoserver";
import Collection from "ol/Collection";
import { LAYER_NAMES } from "@/baseComponent/OpenlayersMap/layers";
import { EventBus } from "@/utils/mitt";

export const ALL_RESOURCE_TYPES = [
  { key: "fireHydrant", label: "消防栓", color: "#f56c6c", icon: "#icon-fire" },
  { key: "fireWaterCrane", label: "消防水鹤", color: "#409eff", icon: "#icon-water" },
  { key: "fireWaterPool", label: "消防水池", color: "#409eff", icon: "#icon-pool" },
  { key: "keyUnit", label: "重点单位", color: "#e6a23c", icon: "#icon-building" },
  { key: "personLocation", label: "人员场所", color: "#67c23a", icon: "#icon-people" },
];

export type CircleQuerySourceData = {
  uuid: string;
  hasGeometry: boolean;
  center: number[] | null;
  centerLonLat: number[] | null;
  radiusMeters: number;
  displayRadius: string;
  cqlFilter: string;
  wmsVisible: boolean;
  wmsLayerName: string;
  resourceTypes: string[];
  stats: {
    total: number;
    perType: Record<string, number>;
  };
  style: {
    strokeColor: string;
    strokeWidth: number;
    fillOpacity: number;
  };
};

export type CircleQueryPatch = Partial<CircleQuerySourceData["style"]> & {
  radiusMeters?: number;
  wmsVisible?: boolean;
  resourceTypes?: string[];
};

export class CircleQueryTool extends BaseTool {
  draw!: Draw;
  modify!: Modify;
  sketch!: Feature | null;
  listeners: EventsKey[] = [];
  radiusTooltip!: Overlay;
  radiusTooltipElement!: HTMLElement;
  wmsLayer!: ImageLayer<ImageWMS> | null = null;
  feature: Feature | null = null;
  sourceData: CircleQuerySourceData;
  private moveendThrottle: ReturnType<typeof setTimeout> | null = null;
  private moveendLeading: boolean = false;

  strokeColor = "#409eff";
  strokeWidth = 2;
  fillOpacity = 10; // 0~100
  selectedResourceTypes: string[] = ALL_RESOURCE_TYPES.map((i) => i.key);

  get drawStyle(): Style {
    return new Style({
      stroke: new Stroke({
        color: this.strokeColor,
        width: this.strokeWidth,
      }),
      fill: new Fill({
        color: `rgba(64, 158, 255, ${(this.fillOpacity / 100).toFixed(2)})`,
      }),
    });
  }

  constructor(options: { map: Map; type: Type; uuid: string; cb: Function }) {
    super(options);
    this.sourceData = {
      uuid: this.uuid,
      hasGeometry: false,
      center: null,
      centerLonLat: null,
      radiusMeters: 0,
      displayRadius: "",
      cqlFilter: "",
      wmsVisible: false,
      wmsLayerName: LAYER_NAMES.ES_WMS_LAYER,
      resourceTypes: [...this.selectedResourceTypes],
      stats: { total: 0, perType: {} },
      style: {
        strokeColor: this.strokeColor,
        strokeWidth: this.strokeWidth,
        fillOpacity: this.fillOpacity,
      },
    };
  }

  init() {
    super.init();

    EventBus.emit("circle-query:update", this.getSourceData());

    this.radiusTooltipElement = document.createElement("div");
    this.radiusTooltipElement.className = "ol-tooltip ol-tooltip-measure";
    this.radiusTooltipElement.style.backgroundColor = "#ffcc33";
    this.radiusTooltipElement.style.padding = "4px 8px";
    this.radiusTooltipElement.style.border = "1px solid #fff";
    this.radiusTooltipElement.style.color = "#000";
    this.radiusTooltipElement.style.borderRadius = "4px";
    this.radiusTooltipElement.style.whiteSpace = "nowrap";

    this.radiusTooltip = markRaw(new Overlay({
      element: this.radiusTooltipElement,
      offset: [15, 0],
      positioning: "center-left",
    }));
    this.map.addOverlay(this.radiusTooltip);

    this.draw = markRaw(new Draw({
      source: this.vectorLayer?.getSource(),
      type: "Circle",
      style: this.drawStyle,
    }));

    this.map.addInteraction(this.draw);

    this.setHelpTooltip = (evt: { coordinate: Coordinate }) => {
      const helpMsg = this.sketch
        ? "松开鼠标结束圈选"
        : "点击并拖动鼠标进行圈选查询";
      this.helpTooltipElement.innerHTML = helpMsg;
      this.helpTooltipElement.style.display = "block";
      this.helpTooltip.setPosition(evt.coordinate);
    };

    this.map.on("pointermove", this.setHelpTooltip as any);

    this.draw.on("drawstart", (evt: any) => {
      this.drawIng = true;
      this.sketch = evt.feature;
    });

    this.draw.on("drawend", (evt: any) => {
      this.drawIng = false;
      this.sketch = null;

      const feature = evt.feature;
      this.feature = feature;
      feature.setId(this.uuid);
      feature.setStyle(this.drawStyle);

      this.updateRadiusAndWMS(feature.getGeometry() as Circle, true);
      EventBus.emit("circle-query:update", this.getSourceData());

      this.map.removeInteraction(this.draw);

      const featureCollection = markRaw(new Collection([feature]));
      this.modify = markRaw(new Modify({
        features: featureCollection,
      }));
      this.map.addInteraction(this.modify);

      const modifyEndKey = this.modify.on("modifyend", (e: any) => {
        const features = e.features.getArray();
        if (features.length > 0) {
          const modifiedGeom = features[0].getGeometry() as Circle;
          this.updateRadiusAndWMS(modifiedGeom, true);
          EventBus.emit("circle-query:update", this.getSourceData());
        }
      });
      this.listeners.push(modifyEndKey);

      const moveEndKey = this.map.on("moveend", () => {
        if (this.moveendLeading) return;
        this.moveendLeading = true;
        this.moveendThrottle = setTimeout(() => {
          this.moveendLeading = false;
          this.moveendThrottle = null;
          if (this.wmsLayer) {
            const geom = feature.getGeometry() as Circle;
            this.updateRadiusAndWMS(geom, true);
            EventBus.emit("circle-query:update", this.getSourceData());
          }
        }, 300);
      });
      this.listeners.push(moveEndKey);
    });
  }

  updateRadiusAndWMS(geom: Circle, triggerWms: boolean) {
    const center = geom.getCenter();
    const radius = geom.getRadius();
    const edgeCoordinate = [center[0] + radius, center[1]];

    const centerLonLat = transform(center, "EPSG:3857", "EPSG:4326");
    const edgeLonLat = transform(edgeCoordinate, "EPSG:3857", "EPSG:4326");
    const distanceInMeters = getDistance(centerLonLat, edgeLonLat);

    const displayRadius =
      distanceInMeters > 1000
        ? (distanceInMeters / 1000).toFixed(1) + "千米"
        : distanceInMeters.toFixed(1) + "米";

    this.radiusTooltipElement.innerHTML = displayRadius;
    this.radiusTooltip.setPosition(edgeCoordinate);

    this.sourceData.hasGeometry = true;
    this.sourceData.center = center;
    this.sourceData.centerLonLat = centerLonLat;
    this.sourceData.radiusMeters = distanceInMeters;
    this.sourceData.displayRadius = displayRadius;

    if (triggerWms) {
      this.updateWMSLayer(centerLonLat, distanceInMeters);
      this.sourceData.wmsVisible = true;
      this.sourceData.cqlFilter =
        `1=1 and DWITHIN(geom,Point(${centerLonLat[0]} ${centerLonLat[1]}), ${distanceInMeters},meters)`;
    }
  }

  updateWMSLayer(centerLonLat: number[], radiusInMeters: number) {
    const cqlFilter = `1=1 and DWITHIN(geom,Point(${centerLonLat[0]} ${centerLonLat[1]}), ${radiusInMeters},meters)`;

    if (!this.wmsLayer) {
      this.wmsLayer = markRaw(new ImageLayer({
        source: markRaw(new ImageWMS({
          url: geoserverApi.getWMSServiceUrl("gis"),
          params: {
            LAYERS: "gis:mapresource",
            VERSION: "1.1.0",
            FORMAT: "image/png",
            TRANSPARENT: true,
            CQL_FILTER: cqlFilter,
          },
          serverType: "geoserver",
          crossOrigin: "anonymous",
          ratio: 1.5,
        })),
        className: LAYER_NAMES.ES_WMS_LAYER,
        zIndex: 100,
      })) as ImageLayer<ImageWMS>;
      this.map.addLayer(this.wmsLayer);
    } else {
      const source = this.wmsLayer.getSource();
      if (source) {
        source.updateParams({ CQL_FILTER: cqlFilter });
      }
    }
  }

  getSourceData(): CircleQuerySourceData {
    this.sourceData.style = {
      strokeColor: this.strokeColor,
      strokeWidth: this.strokeWidth,
      fillOpacity: this.fillOpacity,
    };
    this.sourceData.resourceTypes = [...this.selectedResourceTypes];
    this.sourceData.stats = this.computeStats();
    return {
      ...this.sourceData,
      style: { ...this.sourceData.style },
      stats: {
        ...this.sourceData.stats,
        perType: { ...this.sourceData.stats.perType },
      },
    };
  }

  applyPatch(patch: CircleQueryPatch) {
    if (typeof patch.strokeColor === "string") this.strokeColor = patch.strokeColor;
    if (typeof patch.strokeWidth === "number") this.strokeWidth = patch.strokeWidth;
    if (typeof patch.fillOpacity === "number") this.fillOpacity = patch.fillOpacity;
    if (this.feature) this.feature.setStyle(this.drawStyle);

    if (typeof patch.radiusMeters === "number" && this.feature) {
      const geom = this.feature.getGeometry() as Circle | undefined;
      if (geom) {
        geom.setRadius(patch.radiusMeters);
        this.updateRadiusAndWMS(geom, true);
      }
    }

    if (typeof patch.wmsVisible === "boolean") {
      if (!patch.wmsVisible) {
        this.clearES_WMSLayer();
        this.sourceData.wmsVisible = false;
      } else if (this.sourceData.centerLonLat && this.sourceData.radiusMeters) {
        this.updateWMSLayer(this.sourceData.centerLonLat, this.sourceData.radiusMeters);
        this.sourceData.wmsVisible = true;
      }
    }

    if (Array.isArray(patch.resourceTypes)) {
      this.selectedResourceTypes = [...patch.resourceTypes];
    }

    EventBus.emit("circle-query:update", this.getSourceData());
  }

  /**
   * 基于半径/类型估算资源数(前端演示);后续接入真实接口可替换此处
   */
  private computeStats(): CircleQuerySourceData["stats"] {
    const radiusKm = Math.max(this.sourceData.radiusMeters / 1000, 0);
    const base = Math.max(0, Math.round(radiusKm * 12));
    const perType: Record<string, number> = {};
    let total = 0;
    for (const t of ALL_RESOURCE_TYPES) {
      const seed = (this.uuid.charCodeAt(0) + t.key.length) % 7;
      const count = this.selectedResourceTypes.includes(t.key)
        ? Math.max(0, Math.round(base * (0.6 + seed * 0.07)))
        : 0;
      perType[t.key] = count;
      total += count;
    }
    return { total, perType };
  }

  destroy() {
    if (this.moveendThrottle) {
      clearTimeout(this.moveendThrottle);
      this.moveendThrottle = null;
    }
    this.moveendLeading = false;
    this.listeners.forEach((key) => unByKey(key));
    this.listeners = [];
    if (this.draw) this.map.removeInteraction(this.draw);
    if (this.modify) this.map.removeInteraction(this.modify);
    if (this.radiusTooltip) this.map.removeOverlay(this.radiusTooltip);
    this.map.un("pointermove", this.setHelpTooltip as any);
    EventBus.emit("circle-query:close", { uuid: this.uuid });
    super.destroy();
  }

  clearES_WMSLayer() {
    if (this.wmsLayer) this.map.removeLayer(this.wmsLayer);
    this.wmsLayer = null;
  }
}
