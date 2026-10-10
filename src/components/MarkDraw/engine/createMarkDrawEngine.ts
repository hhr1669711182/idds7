/**
 * MarkDraw 核心引擎（零 Vue 依赖）。
 */
import type { Map as OLMap } from "ol";
import type Feature from "ol/Feature";
import { Style, Stroke, Fill, Circle as CircleStyle } from "ol/style";
import type { StyleLike } from "ol/style/Style";

import { MarkDrawVectorLayer } from "./MarkDrawVectorLayer";
import { MarkDrawSelectInteraction } from "./MarkDrawSelectInteraction";
import { MarkDrawEmitter } from "./emitter";
import { geometryToLngLat } from "../utils/proj";
import { exportFeatureCollection, importFeatureCollection } from "../utils/geojson";
import { getLayer } from "../view/layerConfig";
import { createTool } from "../tools";
import type {
  MarkDrawEngineOptions,
  MarkDrawEventMap,
  MarkDrawEventName,
  MarkDrawFeature,
  MarkDrawLayer,
  MarkDrawToolType,
  MeasurePayload,
} from "./types";

const DEFAULT_STYLE = (tool: MarkDrawToolType): StyleLike => {
  switch (tool) {
    case "Point":
      return new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: "#ff0000" }),
          stroke: new Stroke({ color: "#fff", width: 2 }),
        }),
      });
    case "MILITARY_ARROW":
    case "MILITARY_DOUBLE_LINE":
    case "MILITARY_CURVE":
    case "MILITARY_CLUSTER_ARROW":
    case "MILITARY_TACTIC":
      return new Style({ stroke: new Stroke({ color: "#e6a23c", width: 3 }) });
    default:
      return new Style({
        stroke: new Stroke({ color: "#ff0000", width: 2 }),
        fill: new Fill({ color: "rgba(255,0,0,0.2)" }),
      });
  }
};

export type MarkDrawEventListener<K extends MarkDrawEventName> = (
  payload: MarkDrawEventMap[K][number]
) => void;

export interface CreateMarkDrawEngineResult {
  addFeature: (feature: Feature, layer?: MarkDrawLayer) => MarkDrawFeature;
  removeFeature: (id: string | number) => void;
  /** 批量删除：用于「清除元素」等一次性清场 */
  removeFeatures: (ids: Array<string | number>) => number;
  /** 清空当前全部绘制要素（含未落库草稿），返回清除数量 */
  clearFeatures: () => number;
  updateFeature: (feature: Feature) => MarkDrawFeature | null;
  getAll: () => Feature[];
  getById: (id: string | number) => Feature | undefined;
  importGeoJSON: (text: string) => Feature[];
  exportGeoJSON: () => string;
  setActiveTool: (tool: MarkDrawToolType | null) => void;
  getActiveTool: () => MarkDrawToolType | null;
  selectById: (id: string | number | null) => void;
  flyTo: (feature: Feature) => void;
  on: <K extends MarkDrawEventName>(event: K, listener: MarkDrawEventListener<K>) => () => void;
  off: <K extends MarkDrawEventName>(event: K, listener: MarkDrawEventListener<K>) => void;
  destroy: () => void;
  getActiveToolInstance: () => unknown | null;
  setActiveToolInstance: (instance: unknown, destroy: () => void) => void;
  setActiveLayer: (layer: MarkDrawLayer | null) => void;
  getActiveLayer: () => MarkDrawLayer | null;
  vectorLayer: import("ol/layer/Vector").default;
}

export const createMarkDrawEngine = (
  map: OLMap,
  options: MarkDrawEngineOptions = {}
): CreateMarkDrawEngineResult => {
  const emitter = new MarkDrawEmitter();
  const vectorLayer = new MarkDrawVectorLayer(map);
  const toolState: {
    name: MarkDrawToolType | null;
    instance: unknown | null;
    destroy?: () => void;
  } = { name: null, instance: null };

  const layerCache: Map<string, MarkDrawLayer> = new Map();
  let activeLayer: MarkDrawLayer | null = null;

  const toPublicFeature = (f: Feature): MarkDrawFeature => {
    const geom = f.getGeometry();
    let g3857: number[][] | number[][][] = [];
    if (geom) {
      g3857 = (geom as unknown as { getCoordinates(): unknown }).getCoordinates() as
        | number[][]
        | number[][][];
    }
    const props = { ...f.getProperties() };
    delete (props as Record<string, unknown>)["_layerId"];
    delete (props as Record<string, unknown>)["_isDirty"];
    const layerId = (f.get("_layerId") as string) ?? "";
    return {
      feature: f,
      id: (f.getId() as string | number) ?? "",
      geometry3857: g3857,
      geometryLngLat: geometryToLngLat(g3857),
      properties: props,
      layerId,
      groupId: layerId.split(":")[0] === "mark" ? "markdraw" : layerId.split(":")[0],
      isDirty: !!f.get("_isDirty"),
    };
  };

  const addFeature = (feature: Feature, layer?: MarkDrawLayer) => {
    if (layer) {
      feature.set("_layerId", layer.id);
      layerCache.set(layer.id, layer);
    }
    if (!feature.getStyle()) {
      const t = toolState.name;
      feature.setStyle(options.defaultStyle?.[t as MarkDrawToolType] ?? DEFAULT_STYLE(t ?? "Point"));
    }
    vectorLayer.source.addFeature(feature);
    const pub = toPublicFeature(feature);
    emitter.emit("feature:added", pub);
    return pub;
  };

  const removeFeature = (id: string | number) => {
    const f = vectorLayer.source.getFeatureById(id);
    if (!f) return;
    vectorLayer.source.removeFeature(f);
    emitter.emit("feature:removed", toPublicFeature(f));
  };

  /** 批量删除：跳过 null id，避免列表/要素不同步时误删 */
  const removeFeatures = (ids: Array<string | number>) => {
    let count = 0;
    ids.forEach((id) => {
      if (id === null || id === undefined || id === "") return;
      const f = vectorLayer.source.getFeatureById(id);
      if (!f) return;
      vectorLayer.source.removeFeature(f);
      emitter.emit("feature:removed", toPublicFeature(f));
      count += 1;
    });
    return count;
  };

  /** 清空全部绘制要素：仅清除内存态，数据库记录保持不变 */
  const clearFeatures = () => {
    // 量算 / 查询工具的图元没有业务 id，不能只按 id 删，直接清空 source
    const removed = vectorLayer.source.getFeatures().length;
    vectorLayer.source.clear();
    emitter.emit("selection:change", null);
    return removed;
  };

  const updateFeature = (feature: Feature): MarkDrawFeature | null => {
    if (!vectorLayer.source.hasFeature(feature)) {
      vectorLayer.source.addFeature(feature);
    } else {
      vectorLayer.source.changed();
    }
    feature.set("_isDirty", true);
    const pub = toPublicFeature(feature);
    emitter.emit("feature:updated", pub);
    emitter.emit("feature:modified", pub);
    return pub;
  };

  const getAll = () => vectorLayer.source.getFeatures();
  const getById = (id: string | number): Feature | undefined =>
    vectorLayer.source.getFeatureById(id) ?? undefined;

  const setActiveTool = (tool: MarkDrawToolType | null) => {
    if (toolState.name === tool) return;
    // 先释放上一个工具
    if (toolState.destroy) {
      try {
        toolState.destroy();
      } catch (e) {
        console.warn("[MarkDraw] previous tool destroy failed", e);
      }
    }
    toolState.name = tool;
    toolState.instance = null;
    toolState.destroy = undefined;
    if (tool) {
      try {
        createTool(tool, {
          map,
          vectorLayer: vectorLayer.layer as never,
          onFeature: (f) => {
            addFeature(f, activeLayer ?? undefined);
          },
          onMeasure: (payload: MeasurePayload) => {
            emitter.emit("measure:result", payload);
          },
          setActiveToolInstance: (inst, destroy) => {
            toolState.instance = inst;
            toolState.destroy = destroy;
          },
        });
      } catch (e) {
        console.error("[MarkDraw] createTool failed", e);
      }
    }
    options.onToolChange?.(tool);
    emitter.emit("tool:change", tool);
  };

  const setActiveToolInstance = (instance: unknown, destroy: () => void) => {
    toolState.instance = instance;
    toolState.destroy = destroy;
  };

  const getActiveTool = () => toolState.name;
  const getActiveToolInstance = () => toolState.instance;

  const selectById = (id: string | number | null) => {
    if (id === null) {
      emitter.emit("selection:change", null);
      return;
    }
    const f = vectorLayer.source.getFeatureById(id);
    emitter.emit("selection:change", f ? toPublicFeature(f) : null);
  };

  const flyTo = (feature: Feature) => {
    const geom = feature.getGeometry();
    if (!geom) return;
    const view = map.getView();
    const extent = (geom as unknown as { getExtent?: () => number[] }).getExtent?.();
    if (extent) {
      view.fit(extent as never, {
        padding: [80, 80, 80, 80],
        duration: 500,
        maxZoom: 18,
      });
    } else {
      const coord = (geom as unknown as { getFirstCoordinate?: () => number[] }).getFirstCoordinate?.();
      if (coord) view.animate({ center: coord, zoom: 17, duration: 500 });
    }
  };

  const setActiveLayer = (layer: MarkDrawLayer | null) => {
    activeLayer = layer;
    if (layer) layerCache.set(layer.id, layer);
    const inst = toolState.instance as unknown as {
      setActiveLayer?: (l: MarkDrawLayer | null) => void;
    } | null;
    inst?.setActiveLayer?.(layer);
  };
  const getActiveLayer = () => activeLayer;

  const on = emitter.on.bind(emitter) as CreateMarkDrawEngineResult["on"];
  const off = emitter.off.bind(emitter) as CreateMarkDrawEngineResult["off"];

  const importGeoJSON = (text: string): Feature[] => {
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      return [];
    }
    const features = importFeatureCollection(json, (id) => {
      const cached = layerCache.get(id);
      if (cached) return cached;
      return getLayer(id);
    });
    features.forEach((f) => vectorLayer.source.addFeature(f));
    return features;
  };

  const exportGeoJSON = (): string => {
    const fc = exportFeatureCollection(vectorLayer.source.getFeatures(), layerCache);
    return JSON.stringify(fc, null, 2);
  };

  let sel: MarkDrawSelectInteraction | null = null;
  if (options.selectEnabled !== false) {
    sel = new MarkDrawSelectInteraction(map, {
      onSelect: (id) => {
        if (id === null) {
          emitter.emit("selection:change", null);
          return;
        }
        const f = vectorLayer.source.getFeatureById(id);
        emitter.emit("selection:change", f ? toPublicFeature(f) : null);
      },
      onModified: (id) => {
        const f = vectorLayer.source.getFeatureById(id);
        if (!f) return;
        f.set("_isDirty", true);
        emitter.emit("feature:modified", toPublicFeature(f));
      },
    });
    sel.onDelete = (id) => removeFeature(id);
  }

  const engine: CreateMarkDrawEngineResult = {
    addFeature,
    removeFeature,
    removeFeatures,
    clearFeatures,
    updateFeature,
    getAll,
    getById,
    importGeoJSON,
    exportGeoJSON,
    setActiveTool,
    getActiveTool,
    selectById,
    flyTo,
    on,
    off,
    getActiveToolInstance,
    setActiveToolInstance,
    setActiveLayer,
    getActiveLayer,
    vectorLayer: vectorLayer.layer as never,
    destroy: () => {
      setActiveTool(null);
      sel?.destroy();
      emitter.clear();
      vectorLayer.destroy();
      emitter.emit("destroy");
    },
  };
  return engine;
};
