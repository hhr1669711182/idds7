/**
 * WFS-T XML 序列化：基于 ol/format/WFS.writeTransaction
 * 命名空间约定 http://www.telewave.com.cn/<workspace>（与现有 PopulationTool 一致）。
 */
import WFS from "ol/format/WFS";
import type Feature from "ol/Feature";
import type { FeatureTypeInfo } from "../../utils/featureType";
import type { MarkDrawLayer } from "../../engine/types";

const buildWFSOptions = (
  layer: MarkDrawLayer,
  info: FeatureTypeInfo
): ConstructorParameters<typeof WFS>[0] => {
  const typeName = layer.typeName.split(":").pop() ?? layer.typeName;
  const base: Record<string, unknown> = {
    featureNS: info.featureNS,
    featureTypes: [typeName],
    geometryName: info.geomField,
    featurePrefix: info.featurePrefix,
  };
  return base as ConstructorParameters<typeof WFS>[0];
};

const serialize = (
  layer: MarkDrawLayer,
  info: FeatureTypeInfo,
  inserts: Feature[] | null,
  updates: Feature[] | null,
  deletes: Feature[] | null
): string => {
  const wfs = new WFS(buildWFSOptions(layer, info));
  const node = wfs.writeTransaction(
    inserts ?? [],
    updates ?? [],
    deletes ?? [],
    { gmlOptions: { srsName: "EPSG:3857" } } as unknown as never
  );
  return (node as unknown as string) ?? new XMLSerializer().serializeToString(node as Node);
};

export const buildInsertXml = (
  layer: MarkDrawLayer,
  info: FeatureTypeInfo,
  features: Feature[]
): string => serialize(layer, info, features, null, null);

export const buildUpdateXml = (
  layer: MarkDrawLayer,
  info: FeatureTypeInfo,
  features: Feature[]
): string => serialize(layer, info, null, features, null);

export const buildDeleteXml = (
  layer: MarkDrawLayer,
  info: FeatureTypeInfo,
  features: Feature[]
): string => serialize(layer, info, null, null, features);

export const buildMixedXml = (
  layer: MarkDrawLayer,
  info: FeatureTypeInfo,
  inserts: Feature[],
  updates: Feature[],
  deletes: Feature[]
): string => serialize(layer, info, inserts, updates, deletes);
