/**
 * 方位角工具（简化）
 */
import { Draw } from "ol/interaction";
import { Style, Stroke } from "ol/style";
import { BaseTool } from "./BaseTool";

export class AzimuthTool extends BaseTool {
  private draw: Draw | null = null;

  init() {
    this.draw = new Draw({
      source: this.vectorLayer.getSource()!,
      type: "LineString",
      style: new Style({ stroke: new Stroke({ color: "#ff0000", width: 2 }) }),
    });
    this.map.addInteraction(this.draw);

    this.listeners.push(
      this.map.on("pointermove", (evt) => {
        this.setHelp(evt.coordinate, "选择起点 → 选择终点 → 双击结束");
      })
    );
    this.listeners.push(
      this.draw.on("drawend", () => {
        this.map.removeInteraction(this.draw!);
      })
    );
  }

  destroy() {
    if (this.draw) this.map.removeInteraction(this.draw);
    super.destroy();
  }
}
