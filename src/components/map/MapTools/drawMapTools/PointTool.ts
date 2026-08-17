import Map from "ol/Map";
import { Type } from "ol/geom/Geometry";
import { BaseTool } from "./BaseTool";
import { Coordinate } from "ol/coordinate";

export class PointTool extends BaseTool {
  handle: Function = () => {};
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
    this.handle = (event: { coordinate: Coordinate }) => {
      const coord = event.coordinate;
      const marker = this.addMarker({ coordinate: coord });
      const overlay = this.createOverlay({
        coordinate: coord,
        className: "popMarker",
        offset: [15, -30],
        content: "未命名",
      });
      this.callback({
        operate: "add",
        uuid: this.uuid,
        marker,
        overlay,
      });
      this.removeListener();
    };
    this.map.on("click", this.handle);

    this.drawIng = true;
    this.setHelpTooltip = (evt: { coordinate: Coordinate }) => {
      let helpMsg = "点击鼠标左键，确定标点位置";

      this.helpTooltip.setPosition(evt.coordinate);

      this.helpTooltipElement.innerHTML = helpMsg;
    };

    this.map.on("pointermove", this.setHelpTooltip);
  }

  removeListener() {
    this.map.un("click", this.handle);

    this.map.un("pointermove", this.setHelpTooltip);
    this.helpTooltipElement.style.display = "none";
    this.drawIng = false;

    this.mapEl?.classList.remove("draw");
    super.destroy();
  }

  destroy() {
    this.removeListener();
  }
}
