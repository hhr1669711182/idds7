import { Draw, Modify } from "ol/interaction";
import TileLayer from "ol/layer/Tile";
import ImageLayer from "ol/layer/Image";
import TileWMS from "ol/source/TileWMS";
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

export class CircleQueryTool extends BaseTool {
  draw!: Draw;
  modify!: Modify;
  sketch!: Feature | null;
  listeners: EventsKey[] = [];
  radiusTooltip!: Overlay;
  radiusTooltipElement!: HTMLElement;
  wmsLayer!: TileLayer<TileWMS> | ImageLayer<ImageWMS>;
  private moveendTimer: ReturnType<typeof setTimeout> | null = null;

  drawStyle = new Style({
    stroke: new Stroke({
      color: "#409eff",
      width: 2,
    }),
    fill: new Fill({
      color: "rgba(64, 158, 255, 0.1)",
    }),
  });

  constructor(options: { map: Map; type: Type; uuid: string; cb: Function }) {
    super(options);
  }

  init() {
    super.init();

    this.radiusTooltipElement = document.createElement("div");
    this.radiusTooltipElement.className = "ol-tooltip ol-tooltip-measure";
    this.radiusTooltipElement.style.backgroundColor = "#ffcc33";
    this.radiusTooltipElement.style.padding = "4px 8px";
    this.radiusTooltipElement.style.border = "1px solid #fff";
    this.radiusTooltipElement.style.color = "#000";
    this.radiusTooltipElement.style.borderRadius = "4px";
    this.radiusTooltipElement.style.whiteSpace = "nowrap";

    this.radiusTooltip = new Overlay({
      element: this.radiusTooltipElement,
      offset: [15, 0],
      positioning: "center-left",
    });
    this.map.addOverlay(this.radiusTooltip);

    this.draw = new Draw({
      source: this.vectorLayer?.getSource(),
      type: "Circle",
      style: this.drawStyle,
    });

    this.map.addInteraction(this.draw);

    this.setHelpTooltip = (evt: { coordinate: Coordinate }) => {
      let helpMsg = this.sketch ? "松开鼠标结束圈选" : "点击并拖动鼠标进行圈选查询";
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
      feature.setId(this.uuid);
      feature.setStyle(this.drawStyle);

      // 绘制结束，触发一次 WMS 查询
      this.updateRadiusAndWMS(feature.getGeometry() as Circle, true);

      this.map.removeInteraction(this.draw);

      const featureCollection = new Collection([feature]);
      this.modify = new Modify({
        features: featureCollection,
      });
      this.map.addInteraction(this.modify);

      // Modify 拖拽结束，触发 WMS 查询
      const modifyEndKey = this.modify.on("modifyend", (e: any) => {
        const features = e.features.getArray();
        if (features.length > 0) {
          const modifiedGeom = features[0].getGeometry() as Circle;
          this.updateRadiusAndWMS(modifiedGeom, true);
        }
      });
      this.listeners.push(modifyEndKey);

      // 地图缩放/平移结束后，300ms 防抖后触发 WMS 查询
      const moveEndKey = this.map.on("moveend", () => {
        if (this.moveendTimer) clearTimeout(this.moveendTimer);
        this.moveendTimer = setTimeout(() => {
          if (this.wmsLayer) {
            const geom = feature.getGeometry() as Circle;
            this.updateRadiusAndWMS(geom, true);
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

    let displayRadius = "";
    if (distanceInMeters > 1000) {
      displayRadius = (distanceInMeters / 1000).toFixed(1) + "千米";
    } else {
      displayRadius = distanceInMeters.toFixed(1) + "米";
    }

    this.radiusTooltipElement.innerHTML = displayRadius;
    this.radiusTooltip.setPosition(edgeCoordinate);

    if (triggerWms) {
      this.updateWMSLayer(centerLonLat, distanceInMeters);
    }
  }

  updateWMSLayer(centerLonLat: number[], radiusInMeters: number) {
    const cqlFilter = `1=1 and DWITHIN(geom,Point(${centerLonLat[0]} ${centerLonLat[1]}), ${radiusInMeters},meters)`;

    if (!this.wmsLayer) {
      const wmsParams = {
        LAYERS: "gis:mapresource",
        VERSION: "1.1.0",
        FORMAT: "image/png",
        TRANSPARENT: true,
        CQL_FILTER: cqlFilter,
      };

      this.wmsLayer = new ImageLayer({
        source: new ImageWMS({
          url: geoserverApi.getWMSServiceUrl("gis"),
          params: wmsParams,
          serverType: "geoserver",
          crossOrigin: "anonymous",
          ratio: 1.5,
        }),
        zIndex: 100,
      });
      console.log("🚀 ~ CircleQueryTool ~ updateWMSLayer ~ this.wmsLayer:", this.wmsLayer)
      this.map.addLayer(this.wmsLayer);
    } else {
      const source = this.wmsLayer.getSource();
      if (source) {
        source.updateParams({ CQL_FILTER: cqlFilter });
      }
    }
  }

  destroy() {
    // 清除防抖定时器
    if (this.moveendTimer) {
      clearTimeout(this.moveendTimer);
      this.moveendTimer = null;
    }
    // 断开所有事件监听
    this.listeners.forEach((key) => unByKey(key));
    this.listeners = [];
    if (this.draw) {
      this.map.removeInteraction(this.draw);
    }
    if (this.modify) {
      this.map.removeInteraction(this.modify);
    }
    if (this.wmsLayer) {
      this.map.removeLayer(this.wmsLayer);
    }
    if (this.radiusTooltip) {
      this.map.removeOverlay(this.radiusTooltip);
    }
    this.map.un("pointermove", this.setHelpTooltip as any);
    super.destroy();
  }
}
