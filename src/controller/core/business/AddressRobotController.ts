/**
 * @Author: hhr
 * @Description: 地址机器人业务控制器
 *  - 接收 GIS 搜索结果 -> 解析 GeoJSON Features -> 上图高亮
 *  - 不依赖 store / 不做生命周期包装，按需由调用方负责清旧
 */
import VectorLayer from "ol/layer/Vector.js";
import type { GenericController } from "../generic/index.js";
// @ts-ignore
import { collectSearchGeoJsonFeatures } from "./AddressRobotUtils/searchFeatures.js";
// @ts-ignore
import { createSearchStyleFunction, createDisplayStyleFunction, createFlashStyleFunction } from "./AddressRobotUtils/searchFeatureStyle.js";
// @ts-ignore
import { featureRenderOrder } from "./AddressRobotUtils/featureRenderOrder.js";

import GeoJSON from "ol/format/GeoJSON";
import VectorSource from "ol/source/Vector.js";
import { Extent } from "ol/extent.js";
import { EventBus } from "@/utils";
import Feature from "ol/Feature.js";
import { Point } from "ol/geom.js";
import { fromLonLat } from "ol/proj.js";
import { getStyle } from "@/baseComponent/amap/featureStyle";

/** Feature -> 图层 ID 前缀 */
const FEATURE_TYPE_PREFIX = "addr_";

export class AddressRobotController {
  constructor(private genericController: GenericController) { }

  /**
   * [AR-01] GIS 搜索结果上图
   * @param data 结构与 gis_search.json / backendResult.json 对齐
   * @param options.businessId 可选，业务隔离 ID
   */
  public async addressRobotGisSearch(data: any, options?: { businessId?: string }) {
    const businessId = options?.businessId ?? "address_robot_default";
    const { geometry } = this.genericController;
    // 清旧业务上图
    // geometry.clearByBusinessId(businessId);

    const { gis_search, highlight_entities, overall_confidence } = data;
    // 给面板展示使用
    EventBus.emit('gis_search', { ...gis_search, confidence: overall_confidence });

    let searchVectorLayer = this.genericController.getVectorLayer(businessId) ?? null;

    if (!searchVectorLayer) {
      searchVectorLayer = new VectorLayer({
        source: new VectorSource(),
        style: createDisplayStyleFunction(),
        renderOrder: featureRenderOrder,
        declutter: true,
        zIndex: 20,
        properties: { name: businessId },
      });
      this.genericController.addLayer(searchVectorLayer);
      searchVectorLayer.setVisible(false);
    }

    searchVectorLayer.getSource()?.clear(); // 清空搜索图层
    searchVectorLayer.setVisible(false);

    let features: any[] = []; // 存放转换后的要素
    const format = new GeoJSON(); // GeoJSON格式转换器

    let i = 0;
    highlight_entities.forEach((item: any) => {
      i++;
      const { geom, ...attrs } = item.attributes;
      // 偶数序号的道路数据清除中文名
      if (i % 2 == 0 && attrs.source_table == "loi_road") {
        attrs.cn_name = undefined;
      }
      const feat = {
        type: "Feature",
        geometry: item.attributes.geom,
        properties: attrs,
      };
      features.push(
        format.readFeature(feat, {
          dataProjection: "EPSG:4326",
          featureProjection: "EPSG:3857",
        }),
      );

      // 增加点样式
      const { source_table, latitude, longitude, coord_sys = 'WGS84', id } = attrs;
      const isPoi = source_table == "poi_3" && (latitude && longitude);
      if (isPoi) {
        const feature = new Feature({ geometry: new Point(fromLonLat([longitude, latitude])) });
        feature.setStyle(getStyle("alarm"));
        feature.setProperties({ alarm: `alarm`, ...attrs });
        features.push(feature);
        // searchVectorLayer.getSource()?.addFeature(feature);
        // geometry.addMarker({
        //   id: attrs.id,
        //   lngLat: [longitude, latitude],
        // });
      }
    });
    // console.log("features ", features);
    searchVectorLayer.getSource()?.addFeatures(features); // 添加要素到图层
    searchVectorLayer.setVisible(true);
    const extent: Extent | null = searchVectorLayer.getSource()?.getExtent() ?? null;
    if (extent?.every(Number.isFinite) && extent?.length > 3) {
      // 确保范围有效
      this.fitToExtent(extent, 1200);
      await this.sleep(1500);
      searchVectorLayer && this.flashFeature(searchVectorLayer);
    }

    // webMapNew --1
    // const features = collectSearchGeoJsonFeatures(highlight_entities);
    // !features.length && console.warn("[AddressRobotController] 地址机器人无高亮元素");
    // for (const feature of features) {
    //   this.renderFeature(feature, businessId);
    // }

    /* ============ 旧实现优先：searchVectorLayer + fitToExtent + flashFeature ============
     * 旧的 searchVectorLayer 与 GeometryController.businessId 分组清除机制冲突，
     * 暂时注释，恢复后需配合新的图层清理策略再启用
     */
    // const flashFeatures = this.highlightSearchFeaturesLegacy(features);
    // if (flashFeatures?.length) {
    //   this.fitToExtentLegacy(this.combineExtent(flashFeatures), 1200);
    //   setTimeout(() => this.flashFeatureLegacy(flashFeatures), 1500);
    // }
  }

  private sleep(ms: number = 1500) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }


  /**
   * 旧实现 - 等价旧版 highlightSearchFeatures(data) 的 features 处理段
   * 兼容 WS 已生成好的空间数据：直接转 OL Features（4326 → 3857），复用 createFlashStyleFunction 闪烁
   */
  // private highlightSearchFeaturesLegacy(features: any[]) {
  //   if (!features?.length) return [];
  //   // features 已通过 collectSearchGeoJsonFeatures 完成 EPSG:3857 投影，直接返回
  //   return features;
  // }

  /**
   * 旧实现 - 合并一组 features 的 extent
   */
  // private combineExtent(features: any[]): [number, number, number, number] | null {
  //   let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  //   for (const f of features) {
  //     const ext = f.getGeometry?.()?.getExtent?.();
  //     if (!ext || !ext.every(Number.isFinite)) continue;
  //     if (ext[0] < minX) minX = ext[0];
  //     if (ext[1] < minY) minY = ext[1];
  //     if (ext[2] > maxX) maxX = ext[2];
  //     if (ext[3] > maxY) maxY = ext[3];
  //   }
  //   return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : null;
  // }

  /**
   * 旧实现 - map.getView().fit(extent, { duration, padding, minZoom, maxZoom })
   */
  private fitToExtent(extent: Extent, duration = 1000) {
    const map = (this.genericController as any).map;
    if (!map?.getView) return;
    map.getView().fit(extent, {
      duration,
      padding: [80, 80, 80, 80],
      minZoom: 10,
      maxZoom: 20,
    });
  }

  /**
   * 旧实现 - flashFeature(duration=3000, interval=500)
   * 依赖 searchVectorLayer 与 createFlashStyleFunction，暂未启用
   */
  private flashFeature(layer: VectorLayer, interval = 500, duration = 3000) {
    let feats: any[] = layer.getSource()?.getFeatures() ?? [];
    let timer = null;
    let isShow = false;

    timer = setInterval(() => {
      isShow = !isShow;
      feats.forEach((item) =>
        item.setStyle(createFlashStyleFunction(item, isShow)),
      );
    }, interval);

    setTimeout(() => {
      clearInterval(timer);
      feats.forEach((item) =>
        item.setStyle(createFlashStyleFunction(item, false)),
      );
    }, duration);
  }





  // --------------------------------------------------------------------------------------------------------------------------





  /**
   * [AR-02] 仅清空指定业务的上图
   */
  public addressRobotClear(options: { businessId?: string } = {}) {
    const businessId = options.businessId ?? "address_robot_default";
    this.genericController.geometry.clearByBusinessId(businessId);
  }

  /**
   * 单个 Feature -> 调 GeometryController 上图
   */
  private renderFeature(feature: any, businessId: string) {
    const { geometry } = this.genericController;
    const geom = feature.getGeometry?.();
    const geomType = geom?.getType?.();
    const rawId = feature.getId?.()
      ?? feature.get?.("anchor_id")
      ?? feature.get?.("source_id")
      ?? feature.get?.("id")
      ?? "unknown";
    const featureId = `${FEATURE_TYPE_PREFIX}${businessId}_${rawId}_${geomType ?? "feat"}`;
    const coords = geom?.getCoordinates?.();

    if (geomType === "Point" || geomType === "MultiPoint") {
      geometry.addMarker({
        id: featureId,
        lngLat: coords,
        // style: this.markerStyleFor(feature),
      });
      return;
    }

    if (geomType === "Polygon" || geomType === "MultiPolygon") {
      const geojson = featureToPolygonGeoJson(feature);
      if (!geojson) return;
      geometry.drawPolygon({
        id: featureId,
        geometry: geojson,
        fillColor: this.fillColorFor(feature),
        strokeColor: this.strokeColorFor(feature),
        strokeWidth: 2,
        style: FEATURE_TYPE_PREFIX,
      });
      return;
    }

    if (geomType === "LineString" || geomType === "MultiLineString") {
      const coordinates = flattenLineCoords(coords, geomType);
      if (!coordinates.length) return;
      geometry.drawLine({
        id: featureId,
        coordinates,
        strokeColor: this.strokeColorFor(feature),
        width: 3,
      });
    }
  }

  private fillColorFor(feature: any) {
    const role = feature.get?.("role");
    switch (role) {
      case "anchor": return "rgba(231, 76, 60, 0.28)";
      case "candidate": return "rgba(39, 174, 96, 0.28)";
      case "anchor_candidate": return "rgba(243, 156, 18, 0.28)";
      case "search_area": return "rgba(33, 150, 243, 0.15)";
      default: return "rgba(149, 165, 166, 0.18)";
    }
  }

  private strokeColorFor(feature: any) {
    const role = feature.get?.("role");
    switch (role) {
      case "anchor": return "#e74c3c";
      case "candidate": return "#27ae60";
      case "anchor_candidate": return "#f39c12";
      case "search_area": return "#2196F3";
      default: return "#7f8c8d";
    }
  }

  private markerStyleFor(_feature: any) {
    return "addressRobot";
  }

  /** 暴露给后续需要复用 OL Style 函数的调用方 */
  public getSearchStyleFunction = createSearchStyleFunction;
}

/* ============ 工具 ============ */

function featureToPolygonGeoJson(feature: any) {
  const geom = feature.getGeometry?.();
  if (!geom) return null;
  const coords = geom.getCoordinates?.();
  const t = geom.getType?.();
  if (t === "Polygon") return { type: "Polygon", coordinates: coords };
  if (t === "MultiPolygon") return { type: "MultiPolygon", coordinates: coords };
  return null;
}

function flattenLineCoords(coords: any, type: string): [number, number][] {
  if (!coords) return [];
  if (type === "LineString") return coords;
  if (type === "MultiLineString") return coords[0] ?? [];
  return [];
}
