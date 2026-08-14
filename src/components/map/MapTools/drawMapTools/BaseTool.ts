import Map from "ol/Map";
import { markRaw, toRaw } from "vue";
import { Coordinate } from "ol/coordinate";
import { Type } from "ol/geom/Geometry";
import { Point } from "ol/geom";
import Overlay, { Positioning } from "ol/Overlay";
import Feature from "ol/Feature";
import { Style, Icon, Circle, Stroke, Fill } from "ol/style";
import { getSVGForSrcById } from "../../../../util/index.ts";
import { LAYER_NAMES } from "../../../../baseComponent/OpenlayersMap/layers.ts";

export class BaseTool {
  map: Map;
  callback: Function = () => { };
  mapEl = document.querySelector(".ol-viewport");
  uuid: string = "";
  vectorLayer: any;
  type: Type;
  helpTooltip!: Overlay;
  setHelpTooltip: Function = () => void 0;
  helpTooltipElement!: HTMLElement;
  drawIng = false;

  private destroyed = false;

  private handleViewportMouseLeave = () => {
    if (this.helpTooltipElement) {
      this.helpTooltipElement.style.display = "none";
    }
  };

  private handleViewportMouseEnter = () => {
    if (this.drawIng && this.helpTooltipElement) {
      this.helpTooltipElement.style.display = "block";
    }
  };

  constructor({
    map,
    uuid,
    type,
    cb,
  }: {
    map: Map;
    uuid: string;
    type: Type;
    cb: Function;
  }) {
    // 兜底 markRaw:防止上游传进来的 map 是 Vue Proxy,
    // 避免 OL 渲染循环被 Proxy get/set 拦截拖慢
    this.map = markRaw(toRaw(map)) as Map;
    this.uuid = uuid;
    this.callback = cb;
    this.type = type;
    this.vectorLayer = map
      .getLayers()
      .getArray()
      .find((i) => i.getClassName() == LAYER_NAMES.VECTOR_LAYER);

    this.helpTooltip = this.createOverlay({
      coordinate: [0, 0],
      offset: [15, 0],
      element: document.querySelector("#helpTxt") as HTMLElement | null,
      positioning: "center-left",
    });

    this.helpTooltipElement = this.helpTooltip.getElement() as HTMLElement;
    this.map.getViewport().addEventListener("mouseleave", this.handleViewportMouseLeave);
    this.map.getViewport().addEventListener("mouseenter", this.handleViewportMouseEnter);

    this.mapEl?.classList.add("draw");
    if (this.mapEl) {
      (this.mapEl as HTMLElement).style.cursor = "pointer";
    }
  }

  createOverlay({
    coordinate,
    className = "",
    offset,
    stopEvent = true,
    insertFirst = true,
    content = "",
    element = null,
    positioning = "bottom-center",
  }: {
    coordinate: Coordinate;
    className?: string;
    content?: string;
    offset: Array<number>;
    stopEvent?: boolean;
    insertFirst?: boolean;
    element?: HTMLElement | null;
    positioning?: Positioning;
  }) {
    const overlay = new Overlay({
      element:
        element ||
        this.createOverlayElement({
          content: content,
          uuid: this.uuid,
          className,
        }),
      positioning: positioning,
      offset: offset || [15, -30],
      position: coordinate,
      autoPan: false,
      stopEvent: stopEvent,
      insertFirst: insertFirst,
    });

    this.map.addOverlay(overlay);
    return overlay;
  }

  createOverlayElement({
    content,
    uuid,
    className,
  }: {
    content: string;
    uuid: string;
    className: string;
  }) {
    const element = document.createElement("div");
    element.className = className || `popOverlay`;
    element.id = `overlay_${uuid}`;
    element.innerHTML = content;
    return element;
  }

  addMarker({
    coordinate,
    symbolId = "icon-symbol-one",
    color = "red",
    anchor = [0.5, 1],
    rotation = 0,
  }: {
    coordinate: Coordinate;
    symbolId?: string;
    color?: string;
    anchor?: Array<number>;
    rotation?: number;
  }) {
    const { uuid, vectorLayer } = this;
    const marker = new Feature({
      id: uuid,
      geometry: new Point(coordinate),
    });

    const markerStyle = new Style({
      image: new Icon({
        anchor: anchor,
        src: getSVGForSrcById({ symbolId, color }),
        scale: 1,
        rotateWithView: true,
        rotation: rotation,
      }),
    });
    marker.setStyle(markerStyle);
    vectorLayer?.getSource().addFeature(marker);

    return marker;
  }

  formatPonit(coordinate: Coordinate) {
    const point = new Point(coordinate);
    const pointFeature = new Feature({
      geometry: point,
    });
    pointFeature.setStyle(
      new Style({
        image: new Circle({
          radius: 5,
          stroke: new Stroke({
            color: "red",
            width: 2,
          }),
          fill: new Fill({
            color: "#fff",
          }),
        }),
      })
    );
    this.vectorLayer?.getSource().addFeature(pointFeature);
  }

  init() { }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    this.drawIng = false;
    this.mapEl?.classList.remove("draw");
    if (this.mapEl) {
      (this.mapEl as HTMLElement).style.cursor = "";
    }
    this.map.getViewport().removeEventListener("mouseleave", this.handleViewportMouseLeave);
    this.map.getViewport().removeEventListener("mouseenter", this.handleViewportMouseEnter);

    if (this.helpTooltipElement) {
      this.helpTooltipElement.style.display = "none";
    }
    if (this.helpTooltip) {
      this.map.removeOverlay(this.helpTooltip);
    }
  }
}