/**
 * DescribeFeatureType 缓存：每个 layer 缓存几何字段名 / 命名空间 / 字段清单。
 * 由于 geoserverApi.describeFeatureType 在该项目中已存在，直接复用。
 *
 * 返回的 fields 是「该图层真实存在的字段名」，WFS-T 写事务前会按它裁剪要素属性，
 * 避免把 MarkDraw 内部的临时字段（name/mark/style/以 _ 开头字段）写进数据库。
 */
import { geoserverApi } from "@/service/geoserver";
import type { MarkDrawLayer } from "../engine/types";

export interface FeatureTypeInfo {
  geomField: string;
  featureNS: string;
  featurePrefix: string;
  required: string[];
  /** 图层真实字段名（含 geomField）：为空表示 DescribeFeatureType 不可用，只能做宽松裁剪 */
  fields: string[];
  raw: unknown;
}

const cache: Map<string, Promise<FeatureTypeInfo>> = new Map();

/** 几何字段名兜底正则 */
const GEOM_NAME_RE = /^(geom|the_geom|geometry|shape|wkt_geom|geom_(3857|4326))$/i;
/** 几何类型名特征（PropertyType 后缀） */
const GEOM_TYPE_RE = /PropertyType$/;

/** 命中即认为是几何字段：优先看字段名，其次看类型（gml:PointPropertyType 之类） */
const looksGeometry = (name: string, type: string): boolean => {
  if (GEOM_NAME_RE.test(name)) return true;
  return /Point|LineString|Polygon|Curve|Geometry|MultiSurface/i.test(type);
};

/** JSON.stringify 的安全版本：循环引用等异常时回落到空串，不让解析链路整体崩掉 */
const safeStringify = (v: unknown): string => {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return "";
  }
};

const fallbackInfo = (layer: MarkDrawLayer, raw: unknown): FeatureTypeInfo => ({
  geomField: "geom",
  featureNS: `http://www.telewave.com.cn/${layer.workspace}`,
  featurePrefix: layer.workspace,
  required: [],
  fields: [],
  raw,
});

/* ------------------------------------------------------------------ *
 * XML 解析（GeoServer 部分版本仍返回 XML）
 * ------------------------------------------------------------------ */

const parseXml = (text: string): Document => {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("DescribeFeatureType 返回非 XML 内容");
  }
  return doc;
};

const detectGeomField = (doc: Document): string | undefined => {
  const elements = Array.from(doc.getElementsByTagName("*"));
  const el = elements.find(
    (n) =>
      n.localName === "element" &&
      !!n.getAttribute("name") &&
      GEOM_TYPE_RE.test(n.getAttribute("type") ?? "")
  );
  return el?.getAttribute("name") ?? undefined;
};

const detectNs = (doc: Document, typeName: string): { featureNS: string; featurePrefix: string } => {
  const target = doc.querySelector(`element[name="${typeName.split(":").pop()}"]`);
  const typeAttr = target?.getAttribute("type") ?? "";
  const [prefix, name] = typeAttr.split(":");
  const ns = doc.querySelector(`*[name="${name}"]`);
  const featureNS = ns?.getAttribute("targetNamespace") ?? `http://www.telewave.com.cn/${typeName.split(":")[0]}`;
  return { featureNS, featurePrefix: prefix ?? typeName.split(":")[0] };
};

const collectRequired = (doc: Document): string[] => {
  const seq = Array.from(doc.getElementsByTagName("xsd:sequence"));
  const out: string[] = [];
  seq.forEach((s) =>
    Array.from(s.children).forEach((child) => {
      const n = child.getAttribute("name");
      const minOccurs = child.getAttribute("minOccurs");
      if (n && minOccurs !== "0") out.push(n);
    })
  );
  return out;
};

const collectFieldsXml = (doc: Document): string[] => {
  const out: string[] = [];
  Array.from(doc.getElementsByTagName("xsd:element")).forEach((n) => {
    const name = n.getAttribute("name");
    if (name && !out.includes(name)) out.push(name);
  });
  Array.from(doc.getElementsByTagName("element"))
    .filter((n) => GEOM_TYPE_RE.test(n.getAttribute("type") ?? ""))
    .forEach((n) => {
      const name = n.getAttribute("name");
      if (name && !out.includes(name)) out.push(name);
    });
  return out;
};

/* ------------------------------------------------------------------ *
 * JSON 解析（GeoServer WFS 1.1 默认返回 JSON）
 * ------------------------------------------------------------------ */

interface JsonDescribe {
  targetNamespace?: string;
  featureTypes?: Array<{
    typeName?: string;
    properties?: Array<{ name?: string; type?: string; minOccurs?: number | string }>;
  }>;
}

const parseJson = (text: string): JsonDescribe | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    return JSON.parse(trimmed) as JsonDescribe;
  } catch {
    return null;
  }
};

export const fetchFeatureTypeInfo = async (layer: MarkDrawLayer): Promise<FeatureTypeInfo> => {
  const key = `${layer.workspace}:${layer.typeName}`;
  if (cache.has(key)) return cache.get(key)!;
  const promise = (async () => {
    const raw: unknown = await geoserverApi.describeFeatureType({ typeName: layer.typeName }, layer.workspace);
    // alova 的 responded：响应体是 JSON 就返回对象，否则返回原始字符串。
    // 两种形态都要覆盖，否则 DescribeFeatureType 的解析会拿到 undefined。
    const text =
      typeof raw === "string"
        ? raw
        : (raw as { data?: string })?.data ?? safeStringify(raw);

    // 1. 优先 JSON
    const json = parseJson(text);
    if (json?.featureTypes?.length) {
      const ft = json.featureTypes[0] ?? {};
      const props = ft.properties ?? [];
      const fields = props
        .map((p) => p.name ?? "")
        .filter((n): n is string => !!n);
      const geomProp = props.find(
        (p) => looksGeometry(p.name ?? "", p.type ?? "") && (p.name ?? "") !== ""
      );
      const typeName = ft.typeName ?? layer.typeName;
      return {
        geomField: geomProp?.name ?? "geom",
        featureNS: json.targetNamespace ?? `http://www.telewave.com.cn/${layer.workspace}`,
        featurePrefix: typeName.includes(":") ? (typeName.split(":")[0] as string) : layer.workspace,
        required: props
          .filter((p) => p.minOccurs !== 0 && p.minOccurs !== "0")
          .map((p) => p.name ?? "")
          .filter((n): n is string => !!n),
        fields,
        raw,
      } satisfies FeatureTypeInfo;
    }

    // 2. XML
    let doc: Document;
    try {
      doc = parseXml(text);
    } catch {
      return fallbackInfo(layer, raw);
    }
    const geomField = detectGeomField(doc) ?? "geom";
    const { featureNS, featurePrefix } = detectNs(doc, layer.typeName);
    const fields = collectFieldsXml(doc);
    return {
      geomField,
      featureNS,
      featurePrefix,
      required: collectRequired(doc),
      fields: fields.length ? fields : [geomField],
      raw,
    } satisfies FeatureTypeInfo;
  })();
  cache.set(key, promise);
  return promise;
};

export const clearFeatureTypeCache = (): void => cache.clear();