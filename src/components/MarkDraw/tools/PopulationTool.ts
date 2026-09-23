/**
 * 实时人口标绘工具（占位）
 * - 画多边形 → 弹提示引导用户填写信息
 * - 不依赖 element-plus；改用引擎回调通知 + console.info
 * - 真接表时改用 geoserverApi.transaction 写入 gis:view_realtime_population
 */
import { Draw } from "ol/interaction";
import { Style, Stroke, Fill, Text } from "ol/style";
import { BaseTool } from "./BaseTool";

export class PopulationTool extends BaseTool {
  private draw: Draw | null = null;

  init() {
    this.draw = new Draw({
      source: this.vectorLayer.getSource()!,
      type: "Polygon",
      style: new Style({
        stroke: new Stroke({ color: "#ff5722", width: 2 }),
        fill: new Fill({ color: "rgba(255,87,34,0.2)" }),
        text: new Text({
          text: "人口标绘中…",
          font: "12px Arial",
          fill: new Fill({ color: "#000" }),
        }),
      }),
    });
    this.map.addInteraction(this.draw);
    this.listeners.push(
      this.map.on("pointermove", (evt) => {
        this.setHelp(evt.coordinate, "框选多边形区域 → 双击结束");
      })
    );
    this.listeners.push(
      this.draw.on("drawend", (evt) => {
        evt.feature.setId(this.uuid);
        evt.feature.set("isPopulation", true);
        evt.feature.set("name", "实时人口区域");
        evt.feature.set("mark", "请在右侧维护表单中填写详情");
        this.cb(evt.feature);
        // eslint-disable-next-line no-console
        console.info("[MarkDraw] population region committed; fill metadata in editor");
      })
    );
  }

  destroy() {
    if (this.draw) this.map.removeInteraction(this.draw);
    super.destroy();
  }
}
