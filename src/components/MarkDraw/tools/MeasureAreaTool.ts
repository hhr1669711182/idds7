/**
 * 测面工具
 */
import { Draw } from "ol/interaction";
import Overlay from "ol/Overlay";
import { Style, Stroke, Fill } from "ol/style";
import { unByKey } from "ol/Observable";
import type Feature from "ol/Feature";
import type { Geometry } from "ol/geom";
import { formatArea, getArea } from "@/utils/mapTool";
import { BaseTool } from "./BaseTool";

export class MeasureAreaTool extends BaseTool {
  private draw: Draw | null = null;
  private tooltip: Overlay | null = null;
  private geomListener: unknown = null;

  init() {
    this.draw = new Draw({
      source: this.vectorLayer.getSource()!,
      type: "Polygon",
      style: new Style({
        stroke: new Stroke({ color: "#ff0000", width: 2 }),
        fill: new Fill({ color: "rgba(255,0,0,0.2)" }),
      }),
    });
    this.map.addInteraction(this.draw);

    this.listeners.push(
      this.map.on("pointermove", (evt) => {
        this.setHelp(evt.coordinate, "点击起点 → 添加节点 → 双击结束");
      })
    );
    this.listeners.push(
      this.draw.on("drawstart", (evt) => {
        const feature = evt.feature as Feature<Geometry>;
        const tip = document.createElement("div");
        tip.className = "markdraw-measure-tip";
        tip.style.cssText = "background:#ffcc33;color:#000;padding:4px 8px;border-radius:4px;font-size:12px;";
        this.tooltip = new Overlay({ element: tip, offset: [0, -15], positioning: "bottom-center", stopEvent: false });
        this.map.addOverlay(this.tooltip);
        this.geomListener = feature.getGeometry()?.on("change", (e: { target: Geometry }) => {
          const area = getArea(e.target as Geometry, false) as number;
          tip.innerHTML = "总面积 " + formatArea(area);
          const geom = e.target as unknown as { getInteriorPoint(): { getCoordinates(): number[] } };
          this.tooltip?.setPosition(geom.getInteriorPoint().getCoordinates());
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
    if (this.geomListener) unByKey(this.geomListener as never);
    if (this.tooltip) this.map.removeOverlay(this.tooltip);
    if (this.draw) this.map.removeInteraction(this.draw);
    this.tooltip = null;
    super.destroy();
  }
}
