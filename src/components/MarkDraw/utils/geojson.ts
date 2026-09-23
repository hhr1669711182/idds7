/**
 * FeatureCollection 序列化 / 还原
 * - 内部存储统一 3857（地图内部投影）
 * - 导出时显式写出 3857 元数据，导入时按坐标系转换
 */
import GeoJSON from "ol/format/GeoJSON";
import type Feature from "ol/Feature";
import type { MarkDrawLayer } from "../engine/types";
import { styleFromJson, styleToJson } from "./styleSerializer";
import type { StyleJson } from "../engine/types";
import type { StyleLike } from "ol/style/Style";

const INTERNAL_KEYS = ["_layerId", "_groupId", "style", "_isDirty"];

export interface ExportFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id?: string | number;
    geometry: unknown;
    properties: Record<string, unknown>;
  }>;
  meta?: {
    exportedAt: string;
    layerIds: string[];
    /** 导出坐标系："3857"（默认） 或 "4326" */
    srs?: string;
  };
}

const toStyleJson = (style: StyleLike | undefined): StyleJson | null => {
  const result = styleToJson(style as never);
  if (Array.isArray(result)) return result[0] ?? null;
  return result;
};

const fmtWrite = new GeoJSON({
  dataProjection: "EPSG:3857",
  featureProjection: "EPSG:3857",
});

export const exportFeatureCollection = (
  features: Feature[],
  layers: Map<string, MarkDrawLayer>
): ExportFeatureCollection => {
  const layerIds = new Set<string>();
  const exportFeatures = features.map((f) => {
    const layerId = (f.get("_layerId") as string) || "mark:mark_features";
    layerIds.add(layerId);
    const props = f.getProperties();
    INTERNAL_KEYS.forEach((k) => delete props[k]);
    const styleJson = toStyleJson(f.getStyle() ?? undefined);
    return {
      type: "Feature" as const,
      id: f.getId() ?? undefined,
      geometry: fmtWrite.writeFeatureObject(f).geometry,
      properties: { ...props, style: styleJson, _layerId: layerId },
    };
  });
  void layers;
  return {
    type: "FeatureCollection",
    features: exportFeatures,
    meta: { exportedAt: new Date().toISOString(), layerIds: Array.from(layerIds), srs: "3857" },
  };
};

export const importFeatureCollection = (
  json: ExportFeatureCollection,
  resolveLayer: (layerId: string) => MarkDrawLayer | undefined
): Feature[] => {
  if (!json || json.type !== "FeatureCollection") return [];
  // 按 meta.srs 判断数据投影
  const srs = (json.meta?.srs ?? "4326") as string;
  const dataProj = srs === "3857" ? "EPSG:3857" : "EPSG:4326";
  const fmt = new GeoJSON({
    dataProjection: dataProj,
    featureProjection: "EPSG:3857",
  });
  return json.features.map((raw) => {
    const layerId = (raw.properties?._layerId as string) ?? "mark:mark_features";
    const layer = resolveLayer(layerId);
    const feature = fmt.readFeature({
      type: "Feature",
      id: raw.id,
      geometry: raw.geometry,
      properties: raw.properties,
    }) as Feature;
    if (raw.id !== undefined) feature.setId(raw.id);
    if (layer) feature.set("_layerId", layer.id);
    const styleJson = raw.properties?.style as StyleJson | null | undefined;
    const style = styleFromJson(styleJson ?? undefined);
    if (style) feature.setStyle(style);
    return feature;
  });
};
