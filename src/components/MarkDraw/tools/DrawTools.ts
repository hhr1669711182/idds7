/**
 * 标绘工具（MarkDraw 内部实现）
 * - 标点：单击落点
 * - 标线 / 标面：连续点绘，双击结束
 * - 画圆 / 画矩形：按住左键拖动
 */
import { Draw } from "ol/interaction";
import { createBox, createRegularPolygon } from "ol/interaction/Draw";
import type { GeometryFunction } from "ol/interaction/Draw";
import type { EventsKey } from "ol/events";
import { Style, Stroke, Fill, Circle as CircleStyle } from "ol/style";
import Feature from "ol/Feature";
import { Point } from "ol/geom";
import type { Coordinate } from "ol/coordinate";
import { BaseTool } from "./BaseTool";

const DRAW_STYLE = new Style({
  stroke: new Stroke({ color: "#ff3b5c", width: 2.5 }),
  fill: new Fill({ color: "rgba(255,59,92,0.2)" }),
});

const HELP: Record<string, string> = {
  LineString: "单击添加节点，双击结束",
  Polygon: "单击添加节点，双击结束",
  Circle: "按住左键拖动画圆",
  Rect: "按住左键拖动画矩形",
};

/** 标点：单击落点 */
export class PointTool extends BaseTool {
  protected helpMessage(): string {
    return "单击地图确定标点位置";
  }

  init() {
    this.drawing = true;
    const handler = (evt: { coordinate: Coordinate }) => {
      const feature = new Feature({ geometry: new Point(evt.coordinate) });
      feature.setStyle(
        new Style({
          image: new CircleStyle({
            radius: 7,
            fill: new Fill({ color: "#ff3b5c" }),
            stroke: new Stroke({ color: "#fff", width: 2.5 }),
          }),
        })
      );
      this.drawEnd(feature);
    };
    this.listeners.push(this.map.on("singleclick", handler) as EventsKey);
  }
}

/** 通用线 / 面 / 圆 / 矩形绘制 */
export class DrawTool extends BaseTool {
  private draw: Draw | null = null;

  protected helpMessage(dragging: boolean): string {
    const base = HELP[this.type] ?? "单击开始绘制";
    return dragging ? "松开鼠标结束绘制" : base;
  }

  init() {
    this.drawing = true;
    let drawType: "LineString" | "Polygon" | "Circle" = "Polygon";
    let geometryFunction: GeometryFunction | undefined;

    if (this.type === "Circle") {
      drawType = "Circle";
      geometryFunction = createRegularPolygon(64) as GeometryFunction;
    } else if (this.type === "Rect") {
      drawType = "Circle";
      geometryFunction = createBox() as GeometryFunction;
    } else if (this.type === "LineString") {
      drawType = "LineString";
    }

    this.draw = new Draw({
      source: this.vectorLayer.getSource()!,
      type: drawType,
      style: DRAW_STYLE,
      geometryFunction,
    });
    this.map.addInteraction(this.draw);

    this.listeners.push(
      this.draw.on("drawend", (evt) => {
        const feature = evt.feature as Feature;
        feature.setStyle(DRAW_STYLE);
        this.map.removeInteraction(this.draw!);
        this.draw = null;
        this.drawEnd(feature);
      }) as EventsKey
    );
  }

  destroy() {
    if (this.draw) this.map.removeInteraction(this.draw);
    this.draw = null;
    super.destroy();
  }
}