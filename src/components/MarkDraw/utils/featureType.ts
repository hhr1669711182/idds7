/**
 * DescribeFeatureType 缓存：每个 layer 缓存几何字段名 / 命名空间 / 必填字段。
 * 由于 geoserverApi.describeFeatureType 在该项目中已存在，直接复用。
 */
import { geoserverApi } from "@/service/geoserver";
import type { MarkDrawLayer } from "../engine/types";

export interface FeatureTypeInfo {
  geomField: string;
  featureNS: string;
  featurePrefix: string;
  required: string[];
  raw: unknown;
}

const cache: Map<string, Promise<FeatureTypeInfo>> = new Map();

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
      /PropertyType$/.test(n.getAttribute("type") ?? "")
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

export const fetchFeatureTypeInfo = async (layer: MarkDrawLayer): Promise<FeatureTypeInfo> => {
  const key = `${layer.workspace}:${layer.typeName}`;
  if (cache.has(key)) return cache.get(key)!;
  const promise = (async () => {
    const raw: unknown = await geoserverApi.describeFeatureType({ typeName: layer.typeName }, layer.workspace);
    const text =
      typeof raw === "string"
        ? raw
        : (raw as { data?: string })?.data ?? JSON.stringify(raw);
    let doc: Document;
    try {
      doc = parseXml(text);
    } catch {
      // 部分 GeoServer 在 Accept=* 时返回 JSON；JSON 形态时退化为默认值
      return {
        geomField: "geom",
        featureNS: `http://www.telewave.com.cn/${layer.workspace}`,
        featurePrefix: layer.workspace,
        required: [],
        raw,
      } satisfies FeatureTypeInfo;
    }
    const geomField = detectGeomField(doc) ?? "geom";
    const { featureNS, featurePrefix } = detectNs(doc, layer.typeName);
    return {
      geomField,
      featureNS,
      featurePrefix,
      required: collectRequired(doc),
      raw,
    } satisfies FeatureTypeInfo;
  })();
  cache.set(key, promise);
  return promise;
};

export const clearFeatureTypeCache = (): void => cache.clear();
