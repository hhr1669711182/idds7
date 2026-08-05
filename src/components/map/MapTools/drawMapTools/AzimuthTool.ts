import { Coordinate } from "ol/coordinate";
import Map from "ol/Map";
import Feature from "ol/Feature";
import { Style, Stroke, Icon, Text, Fill } from "ol/style";
import { Draw, Interaction } from "ol/interaction";
import { unByKey } from "ol/Observable";
import { calculateAngle, createAngleSVG } from "../../../../util/index";
import { BaseTool } from "./BaseTool";
import Geometry, { Type } from "ol/geom/Geometry";
import { Point, LineString } from "ol/geom";
import { transform } from "ol/proj";
import * as turf from "@turf/turf";

export class AzimuthTool extends BaseTool {
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
      width: 2.2,
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
      } else if (length >= 2) {
        helpMsg = "移动鼠标，改变方位角大小,左键单击确认";
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
          Angles: calculateAngle({ points: this.Points, azimuth: true }),
        });
      }
    };

    this.map.on("pointermove", this.setHelpTooltip);

    this.draw.on("drawstart", this.handleMeasureLineStart.bind(this));
    this.draw.on("drawend", this.handleMeasureLineEnd.bind(this));
  }

  drawNorLine() {
    const [lon, lat] = this.Points[0];

    const distance = 500000; //500km
    const norPoint = [lon, lat + distance];

    const lineFeature = new Feature({
      geometry: new LineString([this.Points[0], norPoint]),
    });

    this.Points.unshift(norPoint);
    const textStyle = new Style({
      text: new Text({
        text: "正北方向",
        font: "16px Arial",
        fill: new Fill({
          color: "#000",
        }),
        stroke: new Stroke({
          color: "#fff",
          width: 4,
        }),
        offsetX: 35,
        offsetY: -20,
        rotation: 0,
        rotateWithView: true,
      }),
    });

    lineFeature.setStyle([this.lineStyle, textStyle]);

    this.vectorLayer?.getSource().addFeature(lineFeature);

    //箭头
    this.addMarker({
      coordinate: norPoint,
      symbolId: "icon-arrow",
      anchor: [0.51, 0.5],
    });
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
      if (this.Points.length == 0) {
        this.Points[0] = startPoint;
        this.drawNorLine();
      }

      // 展示分段距离
      const coordinates = geom.getCoordinates().slice(0, -1);

      const pointscount = geom.getCoordinates();
      if (pointscount.length >= 3) {
        let Angles = calculateAngle({ points: this.Points, azimuth: true });
        this.addMarker({
          coordinate: coordinates[1],
          symbolId: "icon-arrow",
          anchor: [0.51, 0.5],
          rotation: Angles.rotation,
        });

        this.Points[2] = coordinates[1];
        console.log(this.Points, coordinates);
        this.addAngleMark({
          coordinate: coordinates[0],
          Angles: Angles,
        });
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

    const startP = transform(this.Points[1], "EPSG:3857", "EPSG:4326");
    const endP = transform(this.Points[2], "EPSG:3857", "EPSG:4326");
    const azimuthInDegrees = turf.rhumbBearing(startP, endP);
    console.log("Azimuth (in degrees):", azimuthInDegrees);
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
        src: createAngleSVG({ Angle: Angles.Angle, rotate: 90 }),
        scale: 1,
        rotateWithView: true,
      }),
    });

    this.marker.setStyle(markerStyle);
    vectorLayer?.getSource().addFeature(this.marker);
  }
}
