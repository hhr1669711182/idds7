/**
 * 工具基类（MarkDraw 内部实现，零业务依赖）
 *
 * 职责：
 * - 自建提示浮层（不依赖 map/card.vue 的 #helpTxt）
 * - 统一鼠标跟随提示与生命周期清理
 * - 子类只需实现 init()，通过 drawEnd(feature) 回灌要素
 */
import type { Map as OLMap } from "ol";
import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";
import Overlay from "ol/Overlay";
import type { Coordinate } from "ol/coordinate";
import type VectorLayer from "ol/layer/Vector";
import type VectorSource from "ol/source/Vector";
import type Feature from "ol/Feature";
import { v4 as uuidv4 } from "uuid";
import type { MarkDrawToolType, MeasurePayload } from "../engine/types";

export interface BaseToolOptions {
  map: OLMap;
  vectorLayer: VectorLayer<VectorSource>;
  type: MarkDrawToolType;
  /** 绘制完成回调：产出的要素交由 engine 落库 */
  cb: (feature: Feature) => void;
  /** 仅量算类工具使用：量算结果不落库，仅回调数值 */
  onMeasure?: (payload: MeasurePayload) => void;
}

export abstract class BaseTool {
  protected map: OLMap;
  protected vectorLayer: VectorLayer<VectorSource>;
  protected uuid: string;
  protected type: MarkDrawToolType;
  protected cb: (feature: Feature) => void;
  protected onMeasure?: (payload: MeasurePayload) => void;

  protected helpEl!: HTMLElement;
  protected helpOverlay!: Overlay;
  protected listeners: EventsKey[] = [];
  protected drawing = false;
  private destroyed = false;

  constructor(options: BaseToolOptions) {
    this.map = options.map;
    this.vectorLayer = options.vectorLayer;
    this.type = options.type;
    this.cb = options.cb;
    this.onMeasure = options.onMeasure;
    this.uuid = uuidv4().replace(/-/g, "");

    // 自建提示浮层，避免依赖外部 #helpTxt
    this.helpEl = document.createElement("div");
    this.helpEl.className = "md-help";
    this.helpOverlay = new Overlay({
      element: this.helpEl,
      positioning: "center-left",
      offset: [15, 0],
      stopEvent: false,
    });
    this.map.addOverlay(this.helpOverlay);

    // 跟随鼠标显示操作提示
    this.listeners.push(
      this.map.on("pointermove", (evt) => {
        const msg = this.helpMessage(evt.dragging);
        if (msg) this.setHelp(evt.coordinate, msg);
        else this.hideHelp();
      })
    );
  }

  /** 子类覆写：返回当前状态下应展示的操作提示 */
  protected helpMessage(_dragging: boolean): string {
    return "";
  }

  protected setHelp(coordinate: Coordinate, msg: string) {
    this.helpEl.innerHTML = msg;
    this.helpEl.style.display = "block";
    this.helpOverlay.setPosition(coordinate);
  }

  protected hideHelp() {
    this.helpEl.style.display = "none";
  }

  /** 子类绘制结束后调用：统一回灌 + 收尾 */
  protected drawEnd(feature: Feature) {
    feature.setId(this.uuid);
    this.drawing = false;
    this.hideHelp();
    this.cb(feature);
  }

  /** 仅量算类工具：结果只回调数值，不落库 */
  protected measureEnd(payload: MeasurePayload) {
    this.drawing = false;
    this.hideHelp();
    this.onMeasure?.(payload);
  }

  abstract init(): void;

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    unByKey(this.listeners);
    this.listeners = [];
    this.map.removeOverlay(this.helpOverlay);
  }
}
