/**
 * 查询类工具（MarkDraw 内部实现）
 * - MEASURELENGTH  框选放大：DragZoom 拖框即缩放
 */
import { DragZoom } from "ol/interaction";
import { always } from "ol/events/condition";
import { BaseTool } from "./BaseTool";

/** 框选放大：按住左键拖出一个矩形，松手即缩放到该范围 */
export class SelectExtentTool extends BaseTool {
  private dragZoom: DragZoom | null = null;

  protected helpMessage(): string {
    return "按住左键拖动，框选范围放大";
  }

  init() {
    this.drawing = true;
    this.dragZoom = new DragZoom({ condition: always, className: "md-drag-zoom" });
    this.map.addInteraction(this.dragZoom);
  }

  destroy() {
    if (this.dragZoom) this.map.removeInteraction(this.dragZoom);
    this.dragZoom = null;
    super.destroy();
  }
}
