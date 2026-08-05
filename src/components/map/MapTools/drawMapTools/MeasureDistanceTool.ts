import { Coordinate } from "ol/coordinate";
import Map from "ol/Map";
import Feature from "ol/Feature";
import { Style, Stroke } from "ol/style";
import Overlay from "ol/Overlay";
import { Draw } from "ol/interaction";
import { getDistance } from "ol/sphere";
import { transform } from "ol/proj";
import { unByKey } from "ol/Observable";
import { formatLength, formatDistance } from "../../../../util";
import { BaseTool } from "./BaseTool";
import Geometry, { Type } from "ol/geom/Geometry";

export class MeasureDistanceTool extends BaseTool {
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

  lineStyle = new Style({
    stroke: new Stroke({
      color: "red",
      width: 3,
    }),
  });

  draw!: Draw;
  listenGeometryChange: any;
  sketch!: Feature | null;
  measureTooltip!: Overlay;

  init() {
    this.draw = new Draw({
      source: (this.vectorLayer as any)?.getSource(),
      type: "LineString",
      style: this.lineStyle,
    });

    this.map.addInteraction(this.draw);

    this.setHelpTooltip = (evt: {
      coordinate: Coordinate;
      dragging: boolean;
    }) => {
      const { coordinate, dragging } = evt;
      if (dragging) return;

      const helpMsg = this.sketch
        ? "Move and click to add point, right click to finish"
        : "Click to choose start point";

      this.helpTooltip.setPosition(coordinate);
      this.helpTooltipElement.innerHTML = helpMsg;
      this.helpTooltipElement.style.display = "block";
    };

    this.map.on("pointermove" as any, this.setHelpTooltip as any);
    this.draw.on("drawstart", this.handleMeasureLineStart.bind(this) as any);
    this.draw.on("drawend", this.handleMeasureLineEnd.bind(this) as any);
  }

  handleMeasureLineStart(evt: {
    feature: Feature<Geometry>;
    coordinate: Coordinate;
  }) {
    this.measureTooltip = this.createOverlay({
      coordinate: [0, 0],
      offset: [0, -15],
      className: "ol-tooltip ol-tooltip-measure",
      stopEvent: false,
      insertFirst: false,
    });

    const { feature, coordinate } = evt;
    this.sketch = feature;
    let tooltipCoord = coordinate;

    this.listenGeometryChange = feature.getGeometry()?.on("change", (evt: any) => {
      const geom = evt.target;
      tooltipCoord = geom.getLastCoordinate();
      const tooltipElement = this.measureTooltip.getElement();
      if (tooltipElement) {
        tooltipElement.innerHTML = "总长" + formatLength(geom);
      }
      this.measureTooltip.setPosition(tooltipCoord);
    });
  }

  handleMeasureLineEnd(evt: { feature: Feature }) {
    const geom = evt.feature.getGeometry() as any;
    const coordinates = geom?.getCoordinates?.() ?? [];

    coordinates.forEach((start: Coordinate, index: number) => {
      this.formatPonit(start);
      const end = coordinates[index + 1];
      if (!end) return;

      const start4326 = transform(start, "EPSG:3857", "EPSG:4326");
      const end4326 = transform(end, "EPSG:3857", "EPSG:4326");
      const distance = getDistance(start4326, end4326);
      this.createOverlay({
        coordinate: end,
        offset: [0, -15],
        className: "ol-tooltip ol-tooltip-measure",
        stopEvent: false,
        content: formatDistance(distance),
      });
    });

    const tooltipElement = this.measureTooltip.getElement();
    if (tooltipElement) {
      tooltipElement.className = "ol-tooltip ol-tooltip-static";
    }
    this.measureTooltip.setOffset([0, -7]);
    evt.feature.setStyle(this.lineStyle);

    this.cleanup(false);
    super.destroy();
  }

  private cleanup(removeMeasureTooltip: boolean) {
    if (this.listenGeometryChange) {
      unByKey(this.listenGeometryChange);
      this.listenGeometryChange = null;
    }
    if (this.draw) {
      this.map.removeInteraction(this.draw);
    }
    this.map.un("pointermove" as any, this.setHelpTooltip as any);
    this.mapEl?.classList.remove("draw");
    this.helpTooltipElement.style.display = "none";

    if (removeMeasureTooltip && this.measureTooltip) {
      this.map.removeOverlay(this.measureTooltip);
    }

    this.sketch = null;
  }

  destroy() {
    this.cleanup(true);
    super.destroy();
  }
}
