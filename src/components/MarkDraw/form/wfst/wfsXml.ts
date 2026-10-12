/**
 * WFS-T XML 序列化：基于 ol/format/WFS.writeTransaction
 * 命名空间约定 http://www.telewave.com.cn/<workspace>（与现有 PopulationTool 一致）。
 *
 * 写事务前的字段裁剪（关键）：
 * OL 的 writeTransaction 会把要素上「所有」属性都写进 XML，
 * 而 MarkDraw 会在要素上挂 style / name / mark 等临时字段，
 * 直接写会把脏字段塞进数据库。这里按 DescribeFeatureType 拿到的真实字段
 * 过滤出一个「写库副本」，geometryName 之外的一律不落库；
 * DescribeFeatureType 不可用（fields 为空）时只写几何，最保守。
 */
import WFS from "ol/format/WFS";
import type { WriteTransactionOptions } from "ol/format/WFS";
import Feature from "ol/Feature";
import type { FeatureTypeInfo } from "../../utils/featureType";
import type { CoordArray, MarkDrawLayer } from "../../engine/types";
import type Geometry from "ol/geom/Geometry";
import Point from "ol/geom/Point";
import MultiPoint from "ol/geom/MultiPoint";
import LineString from "ol/geom/LineString";
import MultiLineString from "ol/geom/MultiLineString";
import Polygon from "ol/geom/Polygon";
import MultiPolygon from "ol/geom/MultiPolygon";
import { geometryToLngLat, lngLatToMercator } from "../../utils/proj";

const buildWFSOptions = (layer: MarkDrawLayer, info: FeatureTypeInfo) => {
  // 注意：OL 的 writeTransaction 读的是 featureType（单数），
  // 写成 featureTypes（复数，读操作才用）会让 getTypeName 拿到 undefined 直接崩。
  const typeName = layer.typeName.split(":").pop() ?? layer.typeName;
  const base: Record<string, unknown> = {
    featureNS: info.featureNS ?? `http://www.telewave.com.cn/${layer.workspace}`,
    featureType: typeName,
    geometryName: info.geomField || "geom",
    featurePrefix: info.featurePrefix || layer.workspace,
  };
  return base as WriteTransactionOptions & { geometryName?: string };
};

/**
 * 按几何类型把坐标换算成另一个口径的 Geometry。
 * 显式分派而不是复用 constructor —— OL 各几何子类的构造函数签名各不相同
 * （Circle 还要 radius、GeometryCollection 要子几何），反射 constructor 既脆弱又难读。
 */
const rebuildGeometry = (geometry: Geometry, toLngLat: boolean): Geometry => {
  const src = geometry as unknown as { getCoordinates(): CoordArray };
  const raw = src.getCoordinates();
  const coords = toLngLat ? geometryToLngLat(raw) : (lngLatToMercator(raw) as CoordArray);
  // 统一过 unknown 再落具体类型：CoordArray 最深只到三维，MultiPolygon 是四层嵌套，
  // 直接断言会被 TS 判为「无充分重叠」。
  const asCoords = coords as unknown;
  switch (geometry.getType()) {
    case "Point":
      return new Point(asCoords as [number, number]);
    case "MultiPoint":
      return new MultiPoint(asCoords as [number, number][]);
    case "LineString":
      return new LineString(asCoords as [number, number][]);
    case "MultiLineString":
      return new MultiLineString(asCoords as [number, number][][]);
    case "Polygon":
      return new Polygon(asCoords as [number, number][][]);
    case "MultiPolygon":
      return new MultiPolygon(asCoords as [number, number][][][]);
    default:
      throw new Error("暂不支持将 " + geometry.getType() + " 转为落库坐标系");
  }
};

/**
 * 生成写库副本：只保留图层真实字段（外键 id / geom / 业务属性）。
 * 不改动原要素，避免污染地图态。
 */
const toWriteFeature = (feature: Feature, info: FeatureTypeInfo): Feature => {
  const clone = new Feature();
  const id = feature.getId();
  if (id !== undefined) clone.setId(id);
  // 几何字段名必须用服务端的真实字段名（DescribeFeatureType 拿到的，如 zone_geom / geom / the_geom），
  // 不能沿用 OL 要素上的默认名 "geometry"：
  // writeUpdate 会读 feature.getGeometryName() 去取对应属性，
  // 名字对不上就抛「No such property: geometry」。
  clone.setGeometryName(info.geomField || feature.getGeometryName());

  // 几何：OL 的 GML writer 要求 srsName 与坐标单位一致（写错会被 GeoServer
  // 当成另一个坐标系，报 PointOutsideEnvelopeException）。
  // 我们对外口径统一 4326，所以在序列化这一刻把 3857 几何转成 4326。
  const geometry = feature.getGeometry();
  if (geometry) clone.setGeometry(rebuildGeometry(geometry, true));

  // fields 为空 = DescribeFeatureType 不可用，只写几何，绝不猜字段
  if (!info.fields.length) return clone;

  const allowed = new Set(info.fields);
  const props = feature.getProperties();
  Object.entries(props).forEach(([key, value]) => {
    if (!allowed.has(key)) return;
    if (value === undefined) return;
    // 几何字段由 geometryName 单独写出，不能再当普通属性写一遍
    if (key === info.geomField || key === clone.getGeometryName()) return;
    clone.set(key, value);
  });
  return clone;
};

const serialize = (
  layer: MarkDrawLayer,
  info: FeatureTypeInfo,
  inserts: Feature[] | null,
  updates: Feature[] | null,
  deletes: Feature[] | null
): string => {
  const wfs = new WFS(buildWFSOptions(layer, info));
  const writeInserts = inserts ? inserts.map((f) => toWriteFeature(f, info)) : null;
  const writeUpdates = updates ? updates.map((f) => toWriteFeature(f, info)) : null;
  // 关键 1：writeTransaction 的第 4 个参数必须自带 featureNS / featureType / featurePrefix。
  // 构造函数的选项只服务于 writeGetFeature，事务路径不会去读它 ——
  // 只传 { gmlOptions } 会让 featureType 为 undefined，
  // 内部 getTypeName 调 undefined.startsWith 直接抛
  // 「Cannot read properties of undefined (reading 'startsWith')」。
  // 关键 2：srsName 用 CRS:84（WGS84 经纬度，lon,lat 序）—— 队站辖区等业务表都是经纬度口径。
  // 不能写 "EPSG:4326"：OL 里该 CRS 的轴序是 neu（lat,lon），GML writer 会把我们的
  // [lon,lat] 再倒一次，GeoServer 按 lat,lon 解析就报 PointOutsideEnvelopeException。
  // CRS:84 在 OL 里是 enu，不倒序，与 OGC "经度在前" 约定一致。
  const txOptions: WriteTransactionOptions = {
    ...buildWFSOptions(layer, info),
    gmlOptions: { srsName: "CRS:84" },
  };
  const node = wfs.writeTransaction(
    writeInserts ?? [],
    writeUpdates ?? [],
    deletes ?? [],
    txOptions
  );
  // writeTransaction 实际返回 DOM Node，不是字符串。
  // 这里必须按类型判断：Node 对象是 truthy，
  // 用 `(node as string) ?? xml` 这样的假值兜底会把 Node 对象本身返回出去，
  // 上层再交给 alova 就会 JSON.stringify 成 "{}" 发给 GeoServer，
  // 服务端按 XML 解析时直接报
  // 「Unexpected character '{' (code 123) in prolog; expected '<'」。
  if (typeof node === "string") return node;
  return new XMLSerializer().serializeToString(node as unknown as Node);
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
