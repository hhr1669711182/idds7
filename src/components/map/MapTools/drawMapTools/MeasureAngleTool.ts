import { Coordinate } from "ol/coordinate";
import Map from "ol/Map";
import Feature from "ol/Feature";
import { Style, Stroke, Icon } from "ol/style";
import { Draw, Interaction } from "ol/interaction";
import { unByKey } from "ol/Observable";
import { calculateAngle, createAngleSVG } from "../../../../util";
import { BaseTool } from "./BaseTool";
import Geometry, { Type } from "ol/geom/Geometry";
import { Point } from "ol/geom";

export class MeasureAngleTool extends BaseTool {
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
    this.Points = [];
  }

  lineStyle = new Style({
    stroke: new Stroke({
      color: "red",
      width: 2,
    }),
  });

  draw!: Interaction;

  listenGeometryChange: any;

  lineCount: number = 0;

  Points: Array<Coordinate> = [];

  marker!: Feature;

  init() {
    this.draw = new Draw({
      source: this.vectorLayer?.getSource(),
      type: "LineString",
      style: this.lineStyle,
    });

    this.map.addInteraction(this.draw);

    this.setHelpTooltip = (evt: {
      coordinate: Coordinate;
      dragging: boolean;
    }) => {
      const { coordinate, dragging } = evt;
      if (dragging) {
        return;
      }
      let helpMsg = "";

      const length = this.Points.length;
      if (length == 0) {
        helpMsg = "选择顶点A，左键单击确认";
      } else if (length == 1) {
        helpMsg = "移动鼠标，选择顶点B";
      } else if (length == 3) {
        helpMsg = "移动鼠标，选择顶点C";
      }
      if (this.Points.length >= 2) {
        this.Points[2] = coordinate;
      }
      this.helpTooltip.setPosition(coordinate);

      this.helpTooltipElement.innerHTML = helpMsg;
      this.helpTooltipElement.style.display = "block";

      if (this.Points.length == 3) {
        this.addAngleMark({
          coordinate: this.Points[1],
          Angles: calculateAngle({ points: this.Points }),
        });
      }
    };

    this.map.on("pointermove", this.setHelpTooltip);

    this.draw.on("drawstart", this.handleMeasureLineStart.bind(this));
    this.draw.on("drawend", this.handleMeasureLineEnd.bind(this));
  }

  handleMeasureLineStart(evt: {
    feature: Feature<Geometry>;
    coordinate: Coordinate;
  }) {
    const { feature, coordinate } = evt;

    this.listenGeometryChange = feature.getGeometry().on("change", (evt) => {
      const geom = evt.target;

      let startPoint = geom.getFirstCoordinate();

      this.addMarker({ coordinate: startPoint, symbolId: "A", anchor: [0, 0] });
      this.formatPonit(startPoint);
      this.Points[0] = startPoint;

      // 展示分段距离
      const coordinates = geom.getCoordinates().slice(0, -1);

      if (coordinates.length > 1) {
        this.addMarker({
          coordinate: coordinates[1],
          symbolId: "B",
          anchor: [1, 1],
        });
        this.formatPonit(coordinates[1]);
        this.Points[1] = coordinates[1];
      }
      const pointscount = geom.getCoordinates();
      if (pointscount.length >= 4) {
        this.addMarker({
          coordinate: coordinates[2],
          symbolId: "C",
          anchor: [0, 0],
        });
        this.addAngleMark({
          coordinate: coordinates[1],
          Angles: calculateAngle({ points: coordinates }),
        });
        this.formatPonit(coordinates[2]);
        this.draw.finishDrawing();
      }
    });
  }

  handleMeasureLineEnd(evt: { feature: Feature }) {
    evt.feature.setStyle(this.lineStyle);

    unByKey(this.listenGeometryChange);

    this.map.removeInteraction(this.draw);

    this.mapEl?.classList.remove("draw");

    this.helpTooltipElement.style.display = "none";
    this.map.un("pointermove", this.setHelpTooltip);
    this.Points = [];
    super.destroy();
  }

  destroy() {
    if (this.listenGeometryChange) {
      unByKey(this.listenGeometryChange);
      this.listenGeometryChange = null;
    }
    if (this.draw) {
      this.map.removeInteraction(this.draw);
    }
    this.map.un("pointermove", this.setHelpTooltip);
    if (this.marker) {
      this.vectorLayer?.getSource().removeFeature(this.marker);
    }
    this.Points = [];
    super.destroy();
  }

  addAngleMark({
    coordinate,
    Angles,
  }: {
    coordinate: Coordinate;
    Angles: { Angle: number; rotate: number };
  }) {
    const { uuid, vectorLayer } = this;
    if (this.marker) {
      vectorLayer?.getSource().removeFeature(this.marker);
    }
    this.marker = new Feature({
      id: uuid,
      geometry: new Point(coordinate),
    });

    var markerStyle = new Style({
      image: new Icon({
        anchor: [0.5, 0.5],
        src: createAngleSVG(Angles),
        scale: 1,
      }),
    });

    this.marker.setStyle(markerStyle);
    vectorLayer?.getSource().addFeature(this.marker);
  }
}
