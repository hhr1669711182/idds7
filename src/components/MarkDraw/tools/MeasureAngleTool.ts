/**
 * 量角工具（简化）
 */
import { Draw } from "ol/interaction";
import { Style, Stroke } from "ol/style";
import type Feature from "ol/Feature";
import type { LineString } from "ol/geom";
import { BaseTool } from "./BaseTool";

export class MeasureAngleTool extends BaseTool {
  private draw: Draw | null = null;
  private points: number[][] = [];

  init() {
    this.draw = new Draw({
      source: this.vectorLayer.getSource()!,
      type: "LineString",
      style: new Style({ stroke: new Stroke({ color: "#ff0000", width: 2 }) }),
    });
    this.map.addInteraction(this.draw);

    this.listeners.push(
      this.map.on("pointermove", (evt) => {
        const help =
          this.points.length === 0
            ? "选择顶点A"
            : this.points.length === 1
            ? "选择顶点B"
            : "选择顶点C → 双击结束";
        this.setHelp(evt.coordinate, help);
      })
    );
    this.listeners.push(
      this.draw.on("drawstart", (evt) => {
        const feature = evt.feature as Feature<LineString>;
        feature.getGeometry()?.on("change", (e: { target: LineString }) => {
          const coords = e.target.getCoordinates();
          if (coords.length === 2) this.points = [coords[0] as number[], coords[1] as number[]];
        });
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
    this.points = [];
    super.destroy();
  }
}
