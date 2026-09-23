/**
 * 框选放大工具（DragZoom）
 */
import { DragZoom } from "ol/interaction";
import { always } from "ol/events/condition";
import { BaseTool } from "./BaseTool";

export class SelectExtentTool extends BaseTool {
  private drag: DragZoom | null = null;

  init() {
    this.drag = new DragZoom({ condition: always });
    this.map.addInteraction(this.drag);
    this.listeners.push(
      this.map.on("pointermove", (evt) => {
        this.setHelp(evt.coordinate, "点击并拖动鼠标进行框选放大");
      })
    );
  }

  destroy() {
    if (this.drag) this.map.removeInteraction(this.drag);
    super.destroy();
  }
}
