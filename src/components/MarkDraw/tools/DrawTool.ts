/**
 * 通用绘线/面/矩形/圆工具
 */
import { Draw } from "ol/interaction";
import { createBox, createRegularPolygon } from "ol/interaction/Draw";
import { Style, Stroke, Fill } from "ol/style";
import type { GeometryFunction } from "ol/interaction/Draw";
import { BaseTool } from "./BaseTool";

const HELP_MAP: Record<string, string> = {
  LineString: "点击起点 → 移动鼠标添加节点 → 双击/右键结束",
  Polygon: "点击起点 → 移动鼠标添加节点 → 双击/右键结束",
  Circle: "按住左键拖动 → 松开完成",
  Rect: "按住左键拖动 → 松开完成",
};

export class DrawTool extends BaseTool {
  private draw: Draw | null = null;

  constructor(options: ConstructorParameters<typeof BaseTool>[0]) {
    super(options);
  }

  init() {
    let drawType: "LineString" | "Polygon" | "Circle" = "Polygon";
    let geometryFunction: GeometryFunction | undefined;
    if (this.type === "Circle") {
      drawType = "Circle";
      geometryFunction = createRegularPolygon(50) as GeometryFunction;
    } else if (this.type === "Rect") {
      drawType = "Circle";
      geometryFunction = createBox() as GeometryFunction;
    } else {
      drawType = this.type === "LineString" ? "LineString" : "Polygon";
    }

    this.draw = new Draw({
      source: this.vectorLayer.getSource()!,
      type: drawType,
      style: new Style({
        stroke: new Stroke({ color: "#ff0000", width: 2 }),
        fill: new Fill({ color: "rgba(255,0,0,0.2)" }),
      }),
      geometryFunction,
    });
    this.map.addInteraction(this.draw);

    this.listeners.push(
      this.map.on("pointermove", (evt) => {
        this.setHelp(evt.coordinate, HELP_MAP[this.type] ?? "点击鼠标开始绘制");
      })
    );
    this.listeners.push(
      this.draw.on("drawend", (evt) => {
        this.hideHelp();
        const f = evt.feature;
        f.setId(this.uuid);
        this.cb(f);
        this.map.removeInteraction(this.draw!);
      })
    );
  }

  destroy() {
    if (this.draw) this.map.removeInteraction(this.draw);
    super.destroy();
  }
}
