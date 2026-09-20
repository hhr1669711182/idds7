/*
 * @Description: 实时人口标绘工具
 * 多边形框选 → 查询 gis:view_realtime_population（相交/包含）→ 展示框选范围内人口数
 * 无命中数据时：按框选面积随机生成人口数，并通过 WFS-T 写入
 * 
 */
import { markRaw } from "vue";
import { ElMessage } from "element-plus";
import Map from "ol/Map";
import Feature from "ol/Feature";
import { Draw } from "ol/interaction";
import { Polygon } from "ol/geom";
import { Style, Stroke, Fill, Text } from "ol/style";
import { unByKey } from "ol/Observable";
import { EventsKey } from "ol/events";
import WFS from "ol/format/WFS";
import type { Coordinate } from "ol/coordinate";
import { v4 as uuidv4 } from "uuid";
import { formatArea, getArea } from "@/utils";
import { geoserverApi } from "@/service/geoserver";
import { BaseTool } from "./BaseTool";

/** 人口图层：读（视图，支持空间查询） */
const READ_TYPE_NAME = "gis:view_realtime_population";
const WORKSPACE = "gis";
/**
 * 人口图层：写（WFS-T 目标）。
 * 数据库视图不可写，GeoServer 会抛 "... is read-only"，
 * 
 */
const WRITE_TYPE_NAME: string = READ_TYPE_NAME;
/** geoserver 工作区命名空间 */
const FEATURE_NS = "http://www.telewave.com.cn/gis";

const DATA_CRS = "EPSG:4326";
const MAP_CRS = "EPSG:3857";
const DEFAULT_OPERATOR = "1";
const DEFAULT_DATA_FROM = "7.0";
/** 人口色带上限，与实时人口图例(0~1000)保持一致 */
const POPULATION_COLOR_MAX = 1000;
/** 随机人口密度区间（人/平方公里） */
const RANDOM_DENSITY_MIN = 200;
const RANDOM_DENSITY_MAX = 2000;

/** "workspace:typeName" → { prefix, name }，用于拼装 WFS-T 报文 */
const splitTypeName = (typeName: string) => {
  const index = typeName.indexOf(":");
  return index > -1
    ? { prefix: typeName.slice(0, index), name: typeName.slice(index + 1) }
    : { prefix: WORKSPACE, name: typeName };
};

export type PopulationZone = {
  zone_id: string;
  zone_name: string;
  met_population: number;
  data_source: string;
  create_by: string;
  create_time: string;
  update_by: string;
  update_time: string;
  is_deleted: boolean;
  datafrom_by: string;
};

type PopulationQueryResult = {
  /** 命中的区域属性列表 */
  items: Array<Partial<PopulationZone>>;
  /** 命中区域的人口合计 */
  population: number;
};

/** 颜色渐变：蓝色 → 青色 → 绿色 → 黄色 → 红色 */
const COLOR_STOPS: Array<{ pos: number; color: [number, number, number] }> = [
  { pos: 0, color: [0, 0, 255] },
  { pos: 0.25, color: [0, 255, 255] },
  { pos: 0.5, color: [0, 128, 0] },
  { pos: 0.75, color: [255, 255, 0] },
  { pos: 1, color: [255, 0, 0] },
];

const interpolateColor = (value: number): [number, number, number] => {
  const ratio = Math.min(1, Math.max(0, value / POPULATION_COLOR_MAX));
  let lower = COLOR_STOPS[0];
  let upper = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (ratio >= COLOR_STOPS[i].pos && ratio <= COLOR_STOPS[i + 1].pos) {
      lower = COLOR_STOPS[i];
      upper = COLOR_STOPS[i + 1];
      break;
    }
  }
  const range = upper.pos - lower.pos;
  const localRatio = range === 0 ? 0 : (ratio - lower.pos) / range;
  return [
    Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * localRatio),
    Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * localRatio),
    Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * localRatio),
  ];
};

const generateZoneId = () => {
  const raw = uuidv4().replace(/-/g, "");
  return `fid-${raw.slice(0, 8)}_${raw.slice(8, 20)}_${raw.slice(20)}`;
};

/** 外环坐标转 WKT，用于 CQL 空间过滤 */
const toWktPolygon = (ring: Coordinate[]) =>
  `POLYGON((${ring.map((c) => `${c[0]} ${c[1]}`).join(", ")}))`;

/**
 * 解析几何字段名（DescribeFeatureType 返回 XSD/XML，几何字段 type 以 PropertyType 结尾；
 * 也兼容部分环境返回的 JSON 结构）
 * 按 typeName 做模块级缓存，避免每次框选都请求
 */
const geometryFieldCache: Record<string, Promise<string>> = {};

/** XSD 中几何属性类型以 "PropertyType" 结尾（如 gml:MultiPolygonPropertyType） */
const isGeometryType = (type = "") => /PropertyType$/.test(type);

/** 从 XSD/XML 文本中解析几何字段名 */
const parseGeometryFieldFromXsd = (text: string): string | undefined => {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (!doc || doc.getElementsByTagName("parsererror").length > 0) return undefined;
  const elements = Array.from(doc.getElementsByTagName("*"));
  const geomEl = elements.find(
    (el) =>
      el.localName === "element" &&
      !!el.getAttribute("name") &&
      isGeometryType(el.getAttribute("type") || ""),
  );
  return geomEl?.getAttribute("name") || undefined;
};

/** 递归收集 DescribeFeatureType JSON 中的全部字段声明（name + type） */
const collectFieldDeclarations = (
  node: unknown,
  output: Array<{ name: string; type: string }>,
) => {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item) => collectFieldDeclarations(item, output));
    return;
  }
  const obj = node as Record<string, unknown>;
  if (typeof obj.name === "string" && typeof obj.type === "string") {
    output.push({ name: obj.name, type: obj.type });
  }
  Object.values(obj).forEach((value) => {
    if (value && typeof value === "object") {
      collectFieldDeclarations(value, output);
    }
  });
};

/** 从 DescribeFeatureType JSON 中解析几何字段名 */
const parseGeometryFieldFromJson = (data: unknown): string | undefined => {
  const fields: Array<{ name: string; type: string }> = [];
  collectFieldDeclarations(data, fields);
  return fields.find((field) => isGeometryType(field.type))?.name;
};

const resolveGeometryField = (typeName: string) => {
  if (!geometryFieldCache[typeName]) {
    geometryFieldCache[typeName] = (async () => {
      const response = await geoserverApi.describeFeatureType({ typeName });
      let field: string | undefined;
      if (typeof response === "string") {
        const text = response.trim();
        // 优先按 XSD/XML 解析；文本若是 JSON（部分环境仍返回）则再走 JSON 解析
        field =
          parseGeometryFieldFromXsd(text) ??
          (() => {
            try {
              return parseGeometryFieldFromJson(JSON.parse(text));
            } catch {
              return undefined;
            }
          })();
      } else {
        field = parseGeometryFieldFromJson(response);
      }
      if (!field) {
        throw new Error(`无法解析图层 ${typeName} 的几何字段，请检查 DescribeFeatureType 响应`);
      }
      return field;
    })().catch((error) => {
      // 失败不缓存，允许下次框选重新探测
      delete geometryFieldCache[typeName];
      throw error;
    });
  }
  return geometryFieldCache[typeName];
};

/** 查询与框选多边形相交/包含的人口区域 */
const queryPopulation = async (wkt: string): Promise<PopulationQueryResult> => {
  const geometryField = await resolveGeometryField(READ_TYPE_NAME);
  const data = await geoserverApi.getWFSFeatures(
    {
      typeName: READ_TYPE_NAME,
      cql_filter: `INTERSECTS(${geometryField}, ${wkt})`,
      maxFeatures: 1000,
    },
    WORKSPACE,
  );

  const items = ((data?.features as Array<any>) || [])
    .map((feature) => feature?.properties || {})
    .filter((properties) => properties && !properties.is_deleted);

  const population = items.reduce(
    (total, properties) => total + (Number(properties.met_population) || 0),
    0,
  );

  return { items, population };
};

/** 解析 WFS-T 响应，异常时抛出错误 */
const parseTransactionResponse = (response: any) => {
  const text = typeof response === "string" ? response : "";
  if (/ExceptionReport|ServiceException/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const exceptionText = Array.from(doc.getElementsByTagName("*"))
      .filter((el) => el.localName === "ExceptionText")
      .map((el) => el.textContent)
      .join("; ")
      .trim();
    throw new Error(exceptionText || "GeoServer 返回异常");
  }
  const result = new WFS().readTransactionResponse(text);
  const inserted = Number(result?.transactionSummary?.totalInserted || 0);
  if (!inserted) throw new Error(`写入 ${WRITE_TYPE_NAME} 失败`);
  return { inserted, insertIds: result?.insertIds || [] };
};

/** XML 文本转义 */
const escapeXml = (value: string) =>
  value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });

/**
 * 手工拼装 WFS-T Insert 报文（几何为 MultiPolygon，EPSG:4326）
 * 不使用 ol/format/WFS：其 GML3 写入器按 EPSG:4326 的 lat/lon 轴序输出坐标，
 * 而 GeoServer 的 EPSG:4326 按 lon/lat 解析，会导致 PointOutsideEnvelopeException。
 * 这里直接按 lon lat 顺序写入 posList，避免轴序差异。
 */
const buildInsertTransaction = (
  zone: PopulationZone,
  geometryName: string,
  rings: Coordinate[][],
  target: { prefix: string; name: string },
) => {
  const posList = rings
    .map((ring) => ring.map((c) => `${c[0]} ${c[1]}`).join(" "))
    .join(" ");

  const properties = Object.entries(zone)
    .map(([key, value]) => `<${target.prefix}:${key}>${escapeXml(String(value))}</${target.prefix}:${key}>`)
    .join("");

  return [
    `<wfs:Transaction service="WFS" version="1.1.0"`,
    ` xmlns:wfs="http://www.opengis.net/wfs"`,
    ` xmlns:${target.prefix}="${FEATURE_NS}"`,
    ` xmlns:gml="http://www.opengis.net/gml">`,
    `<wfs:Insert>`,
    `<${target.prefix}:${target.name}>`,
    `<${target.prefix}:${geometryName}>`,
    `<gml:MultiPolygon srsName="${DATA_CRS}">`,
    `<gml:polygonMember>`,
    `<gml:Polygon><gml:exterior><gml:LinearRing>`,
    `<gml:posList srsDimension="2">${posList}</gml:posList>`,
    `</gml:LinearRing></gml:exterior></gml:Polygon>`,
    `</gml:polygonMember>`,
    `</gml:MultiPolygon>`,
    `</${target.prefix}:${geometryName}>`,
    properties,
    `</${target.prefix}:${target.name}>`,
    `</wfs:Insert>`,
    `</wfs:Transaction>`,
  ].join("");
};

/** 通过 WFS-T 新增一条人口区域数据（目标为可写的基础表） */
const insertPopulationZone = async (
  zone: PopulationZone,
  rings: Coordinate[][],
) => {
  const target = splitTypeName(WRITE_TYPE_NAME);
  // GML 几何节点名必须与图层几何字段一致，否则 GeoServer 无法识别
  const geometryName = await resolveGeometryField(WRITE_TYPE_NAME);
  const xml = buildInsertTransaction(zone, geometryName, rings, target);
  const response = await geoserverApi.transaction(xml, WORKSPACE);
  return parseTransactionResponse(response);
};

export class PopulationTool extends BaseTool {
  draw!: Draw;
  sketch: Feature | null = null;
  pointerListener!: EventsKey;

  private closed = false;
  private zoneSeq = 0;

  drawStyle = new Style({
    stroke: new Stroke({ color: "#409eff", width: 2 }),
    fill: new Fill({ color: "rgba(64, 158, 255, 0.15)" }),
  });

  constructor(options: { map: Map; type: string; uuid: string; cb: Function }) {
    super(options as any);
  }

  init() {
    this.addDrawInteraction();

    this.setHelpTooltip = (evt: { coordinate: Coordinate }) => {
      if (!this.helpTooltipElement) return;
      this.helpTooltipElement.innerHTML = this.sketch
        ? "移动鼠标，点击左键确定下一点位，鼠标右键结束框选"
        : "选择起点，左键单击确认，右键结束框选统计人口";
      this.helpTooltipElement.style.display = "block";
      this.helpTooltip.setPosition(evt.coordinate);
    };

    this.pointerListener = this.map.on("pointermove", this.setHelpTooltip as any);
  }

  /** 单次框选：绘制结束后统计人口并结束工具 */
  private addDrawInteraction() {
    if (this.closed) return;

    this.draw = markRaw(
      new Draw({
        source: this.vectorLayer?.getSource(),
        type: "Polygon",
        style: this.drawStyle,
      }),
    );

    // 绘制过程中不做任何请求，仅维护绘制状态与提示文案
    this.draw.on("drawstart", (evt: { feature: Feature }) => {
      this.drawIng = true;
      this.sketch = evt.feature;
    });

    // 绘制结束（右键/双击）后才发起查询与入库
    this.draw.on("drawend", (evt: { feature: Feature }) => {
      this.drawIng = false;
      this.sketch = null;
      this.map.removeInteraction(this.draw);
      if (this.helpTooltipElement) {
        this.helpTooltipElement.style.display = "none";
      }
      void this.handleDrawn(evt.feature).finally(() => this.destroy());
    });

    this.map.addInteraction(this.draw);
  }

  private async handleDrawn(feature: Feature) {
    const geom3857 = feature.getGeometry() as Polygon;
    if (!geom3857) return;

    // 面积（平方米），数据坐标系下的多边形 / MultiPolygon
    const area = Number(getArea(geom3857, false)) || 0;
    const geom4326 = geom3857.clone().transform(MAP_CRS, DATA_CRS) as Polygon;
    const rings = geom4326.getCoordinates();
    if (!rings?.length) return;
    // const wkt = toWktPolygon(rings[0]);

    this.showHint(geom3857.getInteriorPoint().getCoordinates(), "人口统计中...");

    // 1. 查询框选范围内是否已有历史数据
    let items: Array<Partial<PopulationZone>> = [];
    let population = 0;
    // try {
    //   const result = await queryPopulation(wkt);
    //   items = result.items;
    //   population = result.population;
    // } catch (error: any) {
    //   this.showError(error);
    //   return;
    // }

    if (items.length) {
      const zoneName = items
        .map((item) => item.zone_name)
        .filter(Boolean)
        .join("、");
      this.applyResult(feature, { population, area, zoneName });
      ElMessage.success(
        `框选面积 ${formatArea(area)}，范围内共 ${population} 人（命中 ${items.length} 个区域）`,
      );
      this.hideHint();
      return;
    }

    // 2. 无历史数据：按框选面积随机生成人口数并尝试入库
    //    （目标视图/表只读等失败时，仍在图上展示生成值并标记“未入库”）
    const zone = this.createZone(area);
    let zoneName = zone.zone_name;
    let inserted = false;
    // try {
    //   await insertPopulationZone(zone, rings);
    //   inserted = true;
    // } catch (error: any) {
    //   console.error("[PopulationTool] 人口入库失败", error);
    //   zoneName = `${zone.zone_name}（未入库）`;
    //   ElMessage.warning(
    //     `已生成 ${zone.met_population} 人，但入库失败：${error?.message || error?.response?.statusText || "请稍后重试"}`,
    //   );
    // }

    this.applyResult(feature, { population: zone.met_population, area, zoneName });
    if (inserted) {
      ElMessage.success(
        `框选面积 ${formatArea(area)}，范围内无历史数据，已生成并入库 ${zone.met_population} 人`,
      );
    }
    this.hideHint();
  }

  private showError(error: any) {
    console.error("[PopulationTool] 人口统计失败", error);
    this.hideHint();
    ElMessage.error(
      `人口统计失败：${error?.message || error?.response?.statusText || "请稍后重试"}`,
    );
  }

  /** 按面积随机生成一条人口区域数据 */
  private createZone(area: number): PopulationZone {
    const squareKilometers = area / 1e6;
    const density =
      RANDOM_DENSITY_MIN + Math.random() * (RANDOM_DENSITY_MAX - RANDOM_DENSITY_MIN);
    const now = new Date().toISOString();
    this.zoneSeq += 1;

    return {
      zone_id: generateZoneId(),
      zone_name: `框选区域${this.zoneSeq}`,
      met_population: Math.max(1, Math.round(squareKilometers * density)),
      data_source: "人工添加",
      create_by: DEFAULT_OPERATOR,
      create_time: now,
      update_by: DEFAULT_OPERATOR,
      update_time: now,
      is_deleted: false,
      datafrom_by: DEFAULT_DATA_FROM,
    };
  }

  /** 将统计结果渲染到框选多边形上（配色与实时人口图例一致） */
  private applyResult(
    feature: Feature,
    info: { population: number; area: number; zoneName: string },
  ) {
    const { population, area, zoneName } = info;
    const [r, g, b] = interpolateColor(population);

    feature.setId(this.uuid);
    feature.set("met_population", population);
    feature.set("zone_name", zoneName);
    feature.setStyle([
      new Style({
        fill: new Fill({ color: `rgba(${r}, ${g}, ${b}, 0.35)` }),
        stroke: new Stroke({ color: `rgb(${r}, ${g}, ${b})`, width: 2 }),
        text: new Text({
          text: `${population} 人`,
          font: "bold 15px Arial",
          fill: new Fill({ color: "#1f2937" }),
          stroke: new Stroke({ color: "#fff", width: 3 }),
          overflow: true,
        }),
      }),
      new Style({
        text: new Text({
          text: [formatArea(area), zoneName].filter(Boolean).join(" · "),
          font: "12px Arial",
          fill: new Fill({ color: "#4b5563" }),
          stroke: new Stroke({ color: "#fff", width: 2 }),
          offsetY: 18,
          textAlign: "center",
          overflow: true,
        }),
      }),
    ]);
  }

  private showHint(coordinate: Coordinate, text: string) {
    if (!this.helpTooltipElement) return;
    this.helpTooltipElement.innerHTML = text;
    this.helpTooltipElement.style.display = "block";
    this.helpTooltip.setPosition(coordinate);
  }

  private hideHint() {
    if (this.helpTooltipElement && !this.drawIng) {
      this.helpTooltipElement.style.display = "none";
    }
  }

  destroy() {
    this.closed = true;
    if (this.draw) {
      this.map.removeInteraction(this.draw);
    }
    if (this.pointerListener) {
      unByKey(this.pointerListener);
    }
    this.sketch = null;
    super.destroy();
  }
}
