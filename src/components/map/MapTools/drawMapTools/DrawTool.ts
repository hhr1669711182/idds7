import Map from "ol/Map";
import Feature from "ol/Feature";
import { Style, Stroke, Fill } from "ol/style";
import { Draw, Interaction } from "ol/interaction";
import { createRegularPolygon, createBox } from "ol/interaction/Draw";
import { TYPES } from "../../../../const/const.map";
import { BaseTool } from "./BaseTool";
import { Type } from "ol/geom/Geometry";
import { Coordinate } from "ol/coordinate";

export class DrawTool extends BaseTool {
  drawStyle: Style = new Style({
    stroke: new Stroke({
      color: "red",
      width: 2,
    }),
    fill: new Fill({
      color: "rgba(255, 0, 0, 0.2)",
    }),
  });
  constructor({
    map,
    type,
    uuid,
    cb,
  }: {
    map: Map;
    type: Type;
    uuid: string;
    cb: Function;
  }) {
    super({ map, type, uuid, cb });
  }
  init() {
    this.mapEl?.classList.add("draw");
    this.initInteraction();
  }

  draw!: Interaction;

  sketch!: Feature | null;

  initInteraction() {
    if ([TYPES.CIRCLE, TYPES.RECT].includes(this.type)) {
      this.draw = new Draw({
        source: this.vectorLayer?.getSource(),
        type: "Circle",
        style: this.drawStyle,
        freehand: true,
        geometryFunction:
          this.type === TYPES.CIRCLE ? createRegularPolygon(300) : createBox(),
      });
    } else {
      this.draw = new Draw({
        source: this.vectorLayer?.getSource(),
        type: this.type,
        style: this.drawStyle,
      });
    }

    this.map.addInteraction(this.draw);

    this.setHelpTooltip = (evt: {
      coordinate: Coordinate;
      dragging: boolean;
    }) => {
      const { coordinate, dragging } = evt;
      if (dragging && [TYPES.LINESTRING, TYPES.POLYGON].includes(this.type)) {
        return;
      }
      let helpMsg = "";
      switch (this.type) {
        case TYPES.LINESTRING:
          helpMsg = this.sketch
            ? "移动鼠标，点击左键确定下一点位，鼠标右键结束标线绘制"
            : "选择标线起点，左键单击确认";
          break;
        case TYPES.POLYGON:
          helpMsg = this.sketch
            ? "移动鼠标，点击左键确定下一点位，鼠标右键结束绘制"
            : "选择多边形起点，左键单击确认";
          break;
        case TYPES.RECT:
          helpMsg = dragging
            ? "松开鼠标按键结束矩形绘制"
            : "选择矩形其中一个顶点，常按左键拖动鼠标";
          break;
        case TYPES.CIRCLE:
          helpMsg = dragging
            ? "松开鼠标按键结束画圆"
            : "选择圆心位置，常按左键拖动鼠标";
          break;
      }
      this.helpTooltip.setPosition(coordinate);

      this.helpTooltipElement.innerHTML = helpMsg;
      this.helpTooltipElement.style.display = "block";
    };

    this.map.on("pointermove", this.setHelpTooltip);
    this.draw.on("drawstart", (evt: { feature: Feature }) => {
      this.drawIng = true;
      if ([TYPES.LINESTRING, TYPES.POLYGON].includes(this.type)) {
        this.sketch = evt.feature;
      }
    });
    this.draw.on("drawend", (evt: { feature: Feature }) => {
      this.drawIng = false;
      this.helpTooltipElement.style.display = "none";
      this.sketch = null;
      const { feature } = evt;
      feature.setId(this.uuid);
      feature.setStyle(this.drawStyle);
      this.removeListener(feature);
    });
  }

  removeListener(feature: Feature) {
    this.map.removeInteraction(this.draw);
    this.callback({
      operate: "add",
      type: this.type,
      uuid: this.uuid,
      feature: feature,
    });
    this.mapEl?.classList.remove("draw");

    this.map.un("pointermove", this.setHelpTooltip);
    super.destroy();
  }

  destroy() {
    if (this.draw) {
      this.map.removeInteraction(this.draw);
    }
    this.map.un("pointermove", this.setHelpTooltip);
    this.sketch = null;
    super.destroy();
  }
}
