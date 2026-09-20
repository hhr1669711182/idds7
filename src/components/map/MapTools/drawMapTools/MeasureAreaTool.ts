import { Coordinate } from "ol/coordinate";
import Map from "ol/Map";
import Feature from "ol/Feature";
import * as olStyle from "ol/style";
import Overlay from "ol/Overlay";
import { Draw, Interaction } from "ol/interaction";
import { Type } from "ol/geom/Geometry";
import { unByKey } from "ol/Observable";
import { getArea } from "@/utils";
import { BaseTool } from "./BaseTool";
import { EventsKey } from "ol/events";
import type MapBrowserEvent from "ol/MapBrowserEvent";

export class MeasureAreaTool extends BaseTool {
  mapEl = document.querySelector(".ol-viewport");
  uuid: string = "";

  constructor({
    map,
    type,
    uuid,
    cb,
  }: {
    map: Map;
    type: Type;
    uuid: string;
    cb: Function;
  }) {
    super({ map, type, uuid, cb });
  }

  style2 = new olStyle.Style({
    stroke: new olStyle.Stroke({
      color: "red",
      width: 2,
    }),
    fill: new olStyle.Fill({
      color: "rgba(255, 0, 0, 0.2)",
    }),
  });

  draw!: any;
  listener!: EventsKey;
  pointerListener!: EventsKey;
  measureTooltip: any;
  sketch!: Feature | null;

  init() {
        this.draw = new Draw({
      source: this.vectorLayer?.getSource(),
      type: "Polygon",
      style: this.style2,
    });
    this.map.addInteraction(this.draw);

    const setHelpTooltip: (evt: MapBrowserEvent) => void = (evt) => {
      if (evt.dragging) {
        return;
      }
      const helpMsg = this.sketch
        ? "移动鼠标，点击左键确定下一点位，鼠标右键结束面积测量"
        : "选择起点，左键单击确认";
      this.helpTooltip.setPosition(evt.coordinate);
      this.helpTooltipElement.innerHTML = helpMsg;
      this.helpTooltipElement.style.display = "block";
    };

    this.pointerListener = this.map.on("pointermove", setHelpTooltip);

    this.draw.on(
      "drawstart",
      (evt: { feature: Feature; coordinate: Coordinate }) => {
        const { feature }: any = evt;
        this.sketch = feature;
        this.measureTooltip = this.createOverlay({
          coordinate: [0, 0],
          offset: [0, -15],
          className: "ol-tooltip ol-tooltip-measure",
          stopEvent: false,
          insertFirst: false,
        });

        this.listener = feature.getGeometry().on("change", (evt: any) => {
          const geom = evt.target;
          let output: any = getArea(geom, false);
          const coordinates = geom.getCoordinates()[0];
          if (output > 0) {
            let tooltipCoord = coordinates[coordinates.length - 2];
            this.measureTooltip.getElement().innerHTML =
              "总面积" + getArea(geom);
            this.measureTooltip.setPosition(tooltipCoord);
          }
        });
      }
    );
    this.draw.on("drawend", (evt: { feature: Feature }) => {
      this.measureTooltip.getElement().className =
        "ol-tooltip ol-tooltip-static";
      this.measureTooltip.setOffset([0, -7]);
      evt.feature.setStyle(this.style2);
      let coordinates = (evt.feature.getGeometry() as import("ol/geom/Polygon").default).getCoordinates()[0] as Coordinate[];
      for (let index = 0; index < coordinates.length; index++) {
        this.formatPonit(coordinates[index]);
      }
      unByKey(this.listener);
      this.map.removeInteraction(this.draw);
      this.mapEl?.classList.remove("draw");

      this.helpTooltipElement.style.display = "none";
      unByKey(this.pointerListener);
      super.destroy();
    });
  }

  destroy() {
    if (this.listener) {
      unByKey(this.listener);
    }
    if (this.pointerListener) {
      unByKey(this.pointerListener);
    }
    if (this.draw) {
      this.map.removeInteraction(this.draw);
    }
    // if (this.measureTooltip) {
    //   this.map.removeOverlay(this.measureTooltip);
    //   this.measureTooltip = undefined as any;
    // }
    this.sketch = null;
    super.destroy();
  }
}