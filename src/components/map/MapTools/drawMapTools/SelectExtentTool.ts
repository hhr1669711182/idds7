import { DragZoom } from "ol/interaction";
import { always } from "ol/events/condition";
import { BaseTool } from "./BaseTool";
import Map from "ol/Map";
import { Type } from "ol/geom/Geometry";
import { Coordinate } from "ol/coordinate";

export class SelectExtentTool extends BaseTool {
  dragZoom!: DragZoom;

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
    this.dragZoom = new DragZoom({
      condition: always,
      className: "custom-drag-zoom",
    });

    this.map.addInteraction(this.dragZoom);

    this.setHelpTooltip = (evt: { coordinate: Coordinate }) => {
      let helpMsg = "点击并拖动鼠标进行框选放大";
      this.helpTooltipElement.innerHTML = helpMsg;
      this.helpTooltipElement.style.display = "block";
      this.helpTooltip.setPosition(evt.coordinate);
    };

    this.map.on("pointermove", this.setHelpTooltip as any);
  }

  destroy() {
    if (this.dragZoom) {
      this.map.removeInteraction(this.dragZoom);
    }
    this.map.un("pointermove", this.setHelpTooltip as any);
    super.destroy();
  }
}
