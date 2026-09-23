/**
 * WFS-T 事务封装：insert / update / delete / mixed
 * 直接走 geoserverApi.transaction(xml)，由 engine 捕获异常并回滚本地 feature。
 */
import { geoserverApi } from "@/service/geoserver";
import { resolveFeatureType } from "./nsResolver";
import {
  buildInsertXml,
  buildUpdateXml,
  buildDeleteXml,
  buildMixedXml,
} from "./wfsXml";
import type Feature from "ol/Feature";
import type { MarkDrawLayer } from "../../engine/types";

export interface TransactionResult {
  ok: boolean;
  raw: unknown;
  insertedIds?: Array<string | number>;
}

const parseInsertedIds = (raw: unknown): Array<string | number> => {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as { data?: unknown };
  const text =
    typeof r.data === "string"
      ? r.data
      : typeof raw === "string"
      ? raw
      : "";
  if (!text) return [];
  try {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    return Array.from(doc.getElementsByTagName("ogc:FeatureId")).map(
      (n) => n.getAttribute("fid") ?? ""
    );
  } catch {
    return [];
  }
};

export const insertFeatures = async (
  layer: MarkDrawLayer,
  features: Feature[]
): Promise<TransactionResult> => {
  const info = await resolveFeatureType(layer);
  const xml = buildInsertXml(layer, info, features);
  const raw = await geoserverApi.transaction(xml, layer.workspace);
  return { ok: true, raw, insertedIds: parseInsertedIds(raw) };
};

export const updateFeatures = async (
  layer: MarkDrawLayer,
  features: Feature[]
): Promise<TransactionResult> => {
  const info = await resolveFeatureType(layer);
  const xml = buildUpdateXml(layer, info, features);
  const raw = await geoserverApi.transaction(xml, layer.workspace);
  return { ok: true, raw };
};

export const deleteFeatures = async (
  layer: MarkDrawLayer,
  features: Feature[]
): Promise<TransactionResult> => {
  const info = await resolveFeatureType(layer);
  const xml = buildDeleteXml(layer, info, features);
  const raw = await geoserverApi.transaction(xml, layer.workspace);
  return { ok: true, raw };
};

export const mixedTransaction = async (
  layer: MarkDrawLayer,
  inserts: Feature[],
  updates: Feature[],
  deletes: Feature[]
): Promise<TransactionResult> => {
  const info = await resolveFeatureType(layer);
  const xml = buildMixedXml(layer, info, inserts, updates, deletes);
  const raw = await geoserverApi.transaction(xml, layer.workspace);
  return { ok: true, raw, insertedIds: parseInsertedIds(raw) };
};
