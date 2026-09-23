/**
 * 圈选查询工具：拖动画圆 → drawend 跑 WFS DWITHIN → 通过 engine emit 上抛
 */
import { Draw, Modify } from "ol/interaction";
import Overlay from "ol/Overlay";
import { Style, Stroke, Fill } from "ol/style";
import { Circle as CircleGeom } from "ol/geom";
import { unByKey } from "ol/Observable";
import Feature from "ol/Feature";
import { transform } from "ol/proj";
import { BaseTool } from "./BaseTool";
import type { MarkDrawLayer, CircleQueryPayload } from "../engine/types";
import { fetchFeatureTypeInfo } from "../utils/featureType";
import { geoserverApi } from "@/service/geoserver";

export class CircleQueryTool extends BaseTool {
  private draw: Draw | null = null;
  private modify: Modify | null = null;
  private tip: Overlay | null = null;
  private tipEl: HTMLElement | null = null;
  private geomListener: unknown = null;
  private activeLayer: MarkDrawLayer | null = null;
  private emit: (e: "circle-query:result", payload: CircleQueryPayload) => void = () => undefined;

  setActiveLayer(layer: MarkDrawLayer | null) {
    this.activeLayer = layer;
  }

  setEmitter(fn: (e: "circle-query:result", payload: CircleQueryPayload) => void) {
    this.emit = fn;
  }

  init() {
    this.draw = new Draw({
      source: this.vectorLayer.getSource()!,
      type: "Circle",
      style: new Style({
        stroke: new Stroke({ color: "#409eff", width: 2 }),
        fill: new Fill({ color: "rgba(64,158,255,0.1)" }),
      }),
    });
    this.modify = new Modify({ source: this.vectorLayer.getSource()! });
    this.map.addInteraction(this.draw);
    this.map.addInteraction(this.modify);

    this.listeners.push(
      this.map.on("pointermove", (evt) => {
        this.setHelp(evt.coordinate, "按住左键拖动画圆 → 松开完成");
      })
    );
    this.listeners.push(
      this.draw.on("drawstart", (evt) => {
        this.tipEl = document.createElement("div");
        this.tipEl.style.cssText =
          "background:#ffcc33;color:#000;padding:4px 8px;border-radius:4px;";
        this.tipEl.className = "markdraw-circle-tip";
        this.tip = new Overlay({
          element: this.tipEl,
          offset: [0, -15],
          positioning: "bottom-center",
          stopEvent: false,
        });
        this.map.addOverlay(this.tip);
        const f = evt.feature as Feature;
        this.geomListener = f
          .getGeometry()
          ?.on("change", (e: { target: CircleGeom }) => {
            const r = e.target.getRadius();
            if (this.tipEl) this.tipEl.innerHTML = `半径 ${Math.round(r)} m`;
            this.tip?.setPosition(e.target.getCenter());
          });
      })
    );
    this.listeners.push(
      this.draw.on("drawend", async (evt) => {
        evt.feature.setId(this.uuid);
        evt.feature.set("isCircleQuery", true);
        const geom = evt.feature.getGeometry() as CircleGeom;
        const center = geom.getCenter();
        const radius = geom.getRadius();
        const centerLngLat = transform(center, "EPSG:3857", "EPSG:4326") as [number, number];
        this.cb(evt.feature);
        this.map.removeInteraction(this.draw!);
        await this.query(centerLngLat, radius);
      })
    );
  }

  private async query(center: [number, number], radius: number) {
    const layer = this.activeLayer;
    if (!layer || !layer.writable) {
      this.emit("circle-query:result", {
        centerLngLat: center,
        radiusMeters: radius,
        layer: null,
        total: 0,
        perLayer: {},
      });
      return;
    }
    try {
      const info = await fetchFeatureTypeInfo(layer);
      const cql = `DWITHIN(${info.geomField},Point(${center[0]} ${center[1]}),${radius},meters)`;
      const res = await geoserverApi.getWFSFeatures(
        {
          typeName: layer.typeName,
          cql_filter: cql,
          outputFormat: "application/json",
          maxFeatures: 1000,
        },
        layer.workspace
      );
      const total = (res?.features as unknown[] | undefined)?.length ?? 0;
      this.emit("circle-query:result", {
        centerLngLat: center,
        radiusMeters: radius,
        layer,
        total,
        perLayer: { [layer.id]: total },
      });
    } catch (e) {
      console.error("[CircleQueryTool] query failed", e);
      this.emit("circle-query:result", {
        centerLngLat: center,
        radiusMeters: radius,
        layer,
        total: 0,
        perLayer: {},
      });
    }
  }

  destroy() {
    if (this.geomListener) unByKey(this.geomListener as never);
    if (this.tip) this.map.removeOverlay(this.tip);
    if (this.draw) this.map.removeInteraction(this.draw);
    if (this.modify) this.map.removeInteraction(this.modify);
    super.destroy();
  }
}
