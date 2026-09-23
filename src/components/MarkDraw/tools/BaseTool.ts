/**
 * 工具基类（独立实现，不 import 现有 BaseTool）
 */
import type { Map as OLMap } from "ol";
import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";
import { Overlay } from "ol";
import type { Coordinate } from "ol/coordinate";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import { v4 as uuidv4 } from "uuid";
import type { MarkDrawToolType } from "../engine/types";

export interface BaseToolOptions {
  map: OLMap;
  vectorLayer: VectorLayer<VectorSource>;
  type: MarkDrawToolType;
  cb: (feature: import("ol/Feature").default) => void;
}

export abstract class BaseTool {
  protected map: OLMap;
  protected vectorLayer: VectorLayer<VectorSource>;
  protected uuid: string;
  protected type: MarkDrawToolType;
  protected cb: (feature: import("ol/Feature").default) => void;
  protected helpTooltipEl: HTMLElement;
  protected helpOverlay: Overlay;
  protected listeners: EventsKey[] = [];
  protected drawing = false;
  private destroyed = false;

  constructor(options: BaseToolOptions) {
    this.map = options.map;
    this.vectorLayer = options.vectorLayer;
    this.type = options.type;
    this.cb = options.cb;
    this.uuid = uuidv4().replace(/-/g, "");

    this.helpTooltipEl = document.createElement("div");
    this.helpTooltipEl.className = "markdraw-help";
    this.helpTooltipEl.style.cssText =
      "position:relative;background:rgba(0,0,0,.5);border-radius:4px;color:#fff;padding:4px 8px;opacity:.9;white-space:nowrap;font-size:12px;cursor:default;user-select:none;display:none;";
    this.helpOverlay = new Overlay({
      element: this.helpTooltipEl,
      positioning: "center-left",
      offset: [15, 0],
      stopEvent: false,
    });
    this.map.addOverlay(this.helpOverlay);

    const viewport = this.map.getViewport();
    viewport.style.cursor = "crosshair";
    viewport.classList.add("markdraw-drawing");
  }

  /** 设置提示信息 */
  protected setHelp(coordinate: Coordinate, msg: string) {
    this.helpTooltipEl.innerHTML = msg;
    this.helpTooltipEl.style.display = "block";
    this.helpOverlay.setPosition(coordinate);
  }

  /** 隐藏提示 */
  protected hideHelp() {
    this.helpTooltipEl.style.display = "none";
  }

  abstract init(): void;

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    unByKey(this.listeners);
    this.listeners = [];
    this.helpTooltipEl.style.display = "none";
    this.map.removeOverlay(this.helpOverlay);
    const viewport = this.map.getViewport();
    viewport.style.cursor = "";
    viewport.classList.remove("markdraw-drawing");
  }
}
