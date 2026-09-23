/**
 * 点工具：单击落点
 */
import Feature from "ol/Feature";
import { Style, Circle, Fill, Stroke } from "ol/style";
import { Point } from "ol/geom";
import type { Coordinate } from "ol/coordinate";
import { BaseTool } from "./BaseTool";

export class PointTool extends BaseTool {
  private handler = (evt: { coordinate: Coordinate }) => {
    const f = new Feature({ geometry: new Point(evt.coordinate) });
    f.setId(this.uuid);
    f.setStyle(
      new Style({
        image: new Circle({
          radius: 6,
          fill: new Fill({ color: "#ff0000" }),
          stroke: new Stroke({ color: "#fff", width: 2 }),
        }),
      })
    );
    this.cb(f);
    this.map.un("singleclick", this.handler as never);
  };

  init() {
    this.map.on("singleclick", this.handler as never);
    this.listeners.push(this.map.on("pointermove", (evt) => {
      this.setHelp(evt.coordinate, "点击鼠标左键，确定标点位置");
    }));
  }

  destroy() {
    this.map.un("singleclick", this.handler as never);
    super.destroy();
  }
}
