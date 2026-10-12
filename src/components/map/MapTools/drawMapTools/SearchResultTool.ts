import { markRaw } from "vue";
import ImageLayer from "ol/layer/Image";
import ImageWMS from "ol/source/ImageWMS";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import { Point, LineString } from "ol/geom";
import { Style, Circle as StyleCircle, Stroke, Fill, Icon } from "ol/style";
import { fromLonLat } from "ol/proj";
import type Map from "ol/Map";
import type { EventsKey } from "ol/events";
import { unByKey } from "ol/Observable";

import { geoserverApi } from "@/service/geoserver";
import { LAYER_NAMES } from "@/baseComponent/OpenlayersMap/layers";
import { getSVGForSrcById } from "@/utils";
import { isOlMap } from "@/utils/mapTool";
import type { ResourceFilterSet } from "@/types/search";

export interface SearchResultToolOptions {
  map: Map;
  /** 聚焦时的目标 zoom（缺省按当前 zoom + 2） */
  focusZoom?: number;
  focusPadding?: number[];
}

/**
 * 检索结果上图工具。
 *
 * 分工：
 * - 资源：走 WMS 服务端出图（与 CircleQueryTool 一致），前端不持有要素几何，
 *   因此不受 1 万条结果规模影响。
 * - 地址 POI / 列表点选：前端渲染少量要素（点 + 路径线），提供聚焦特效。
 */
export class SearchResultTool {
  private map: Map;
  private options: Required<Pick<SearchResultToolOptions, "focusZoom" | "focusPadding">>;

  private wmsLayer!: ImageLayer<ImageWMS>;
  private focusLayer!: VectorLayer<VectorSource>;
  private routeLayer!: VectorLayer<VectorSource>;
  private focusPulseKey: EventsKey | null = null;

  constructor(options: SearchResultToolOptions) {
    // MapStore 的 map 初值是空对象 / null，必须校验后再建层
    if (!isOlMap(options.map)) {
      throw new TypeError("[SearchResultTool] options.map 不是有效的 OpenLayers Map 实例");
    }
    this.map = options.map;
    this.options = {
      focusZoom: options.focusZoom ?? 17,
      focusPadding: options.focusPadding ?? [80, 80, 80, 80],
    };
    this.initLayers();
  }

  /** 供调用方比对是否为同一个地图实例（路由切换会重建） */
  getMap(): Map {
    return this.map;
  }

  private initLayers() {
    this.focusLayer = markRaw(
      new VectorLayer({
        source: markRaw(new VectorSource()),
        className: LAYER_NAMES.SEARCH_FOCUS_LAYER,
        zIndex: 120,
        updateWhileAnimating: true,
        updateWhileInteracting: true,
      }),
    );

    this.routeLayer = markRaw(
      new VectorLayer({
        source: markRaw(new VectorSource()),
        className: LAYER_NAMES.SEARCH_ROUTE_LAYER,
        zIndex: 110,
      }),
    );

    this.map.addLayer(this.routeLayer);
    this.map.addLayer(this.focusLayer);
  }

  /** WMS 资源出图：LAYERS 逗号拼接，CQL_FILTER 分号分隔且顺序一一对应 */
  showResources(filter: ResourceFilterSet) {
    const { typeNames, filters } = filter;
    if (!typeNames.length) {
      this.clearResources();
      return;
    }

    const params = {
      LAYERS: typeNames.join(","),
      VERSION: "1.1.0",
      FORMAT: "image/png",
      TRANSPARENT: true,
      CQL_FILTER: filters.join(";"),
    };

    if (!this.wmsLayer) {
      this.wmsLayer = markRaw(
        new ImageLayer({
          source: markRaw(
            new ImageWMS({
              url: geoserverApi.getWMSServiceUrl("gis"),
              params,
              serverType: "geoserver",
              crossOrigin: "anonymous",
              ratio: 1.5,
            }),
          ),
          className: LAYER_NAMES.ES_WMS_LAYER,
          zIndex: 100,
        }),
      ) as ImageLayer<ImageWMS>;
      this.map.addLayer(this.wmsLayer);
      return;
    }

    // 已存在则只更新参数，避免重建图层造成闪烁
    this.wmsLayer.getSource()?.updateParams(params);
  }

  /** 无检索结果时显式返回空图，而不是保留上一次的过滤结果 */
  clearResources() {
    if (!this.wmsLayer) return;
    this.wmsLayer.getSource()?.updateParams({ CQL_FILTER: "1=0" });
  }

  /**
   * 地址 POI 结果上图：高德坐标已是 WGS84，直接投影后渲染。
   * 条数受高德单页限制（≤20），前端渲染无压力。
   */
  showAddressPoints(lngLats: [number, number][]) {
    const source = this.focusLayer.getSource();
    source?.clear();
    this.stopPulse();

    lngLats.forEach((lngLat, index) => {
      if (!lngLat) return;
      const feature = new Feature({
        id: `search-address-${index}`,
        geometry: new Point(fromLonLat(lngLat)),
      });
      feature.setStyle(
        new Style({
          image: new Icon({
            src: getSVGForSrcById({ symbolId: "icon-poi-1", color: "#27d2ff" }),
            anchor: [0.5, 1],
            scale: 1,
          }),
        }),
      );
      source?.addFeature(feature);
    });

    if (lngLats.length) this.fitTo(lngLats);
  }

  /** 列表点选定位：单点聚焦 + 脉冲特效 */
  focusPoint(lngLat: [number, number] | null) {
    const source = this.focusLayer.getSource();
    source?.clear();
    this.stopPulse();
    if (!lngLat) return;

    const feature = new Feature({ geometry: new Point(fromLonLat(lngLat)) });
    feature.setStyle(this.createFocusStyle(10, 0.85));
    source?.addFeature(feature);

    this.startPulse(feature);
    this.fitTo([lngLat]);
  }

  private createFocusStyle(radius: number, opacity: number) {
    return new Style({
      zIndex: 2,
      image: new StyleCircle({
        radius,
        stroke: new Stroke({ color: "#ffffff", width: 3 }),
        fill: new Fill({ color: `rgba(39, 210, 255, ${opacity})` }),
      }),
    });
  }

  /** 脉冲特效：仅放大缩小光晕，不动要素位置 */
  private startPulse(feature: Feature) {
    this.stopPulse();
    let expanding = true;
    let radius = 8;
    let opacity = 0.9;

    this.focusPulseKey = this.focusLayer.on("postrender", () => {
      radius += expanding ? 2.2 : -2.2;
      opacity += expanding ? -0.045 : 0.045;
      if (radius >= 30) expanding = false;
      if (radius <= 8) expanding = true;
      if (opacity <= 0.15) opacity = 0.15;
      if (opacity >= 0.9) opacity = 0.9;
      feature.setStyle(this.createFocusStyle(radius, opacity));
    });
  }

  private stopPulse() {
    if (this.focusPulseKey) {
      unByKey(this.focusPulseKey);
      this.focusPulseKey = null;
    }
  }

  /** 路径线：坐标已由调用方从 GCJ-02 转为 WGS84 */
  showRoute(coords: [number, number][]) {
    const source = this.routeLayer.getSource();
    source?.clear();
    if (coords.length < 2) return;

    const feature = new Feature({
      geometry: new LineString(coords.map((lngLat) => fromLonLat(lngLat))),
    });
    feature.setStyle(
      new Style({
        stroke: new Stroke({ color: "#27d2ff", width: 5, lineDash: [1, 0] }),
        zIndex: 1,
      }),
    );
    source?.addFeature(feature);
    this.fitTo(coords);
  }

  /** 路径起终点标记 */
  showRouteEndpoints(start: [number, number] | null, end: [number, number] | null) {
    const source = this.routeLayer.getSource();
    if (!source) return;
    const mark = (lngLat: [number, number] | null, color: string, symbolId: string) => {
      if (!lngLat) return;
      const feature = new Feature({ geometry: new Point(fromLonLat(lngLat)) });
      feature.setStyle(
        new Style({
          image: new Icon({
            src: getSVGForSrcById({ symbolId, color }),
            anchor: [0.5, 0.5],
            scale: 1,
          }),
          zIndex: 3,
        }),
      );
      source?.addFeature(feature);
    };
    mark(start, "#0DC46E", "icon-start-point");
    mark(end, "#ff4d4f", "icon-end-point");
  }

  private fitTo(lngLats: [number, number][]) {
    const valid = lngLats.filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
    if (!valid.length) return;
    const points = valid.map((lngLat) => fromLonLat(lngLat));
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const extent: [number, number, number, number] = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];
    this.map.getView().fit(extent, {
      padding: this.options.focusPadding as [number, number, number, number],
      duration: 400,
      maxZoom: this.options.focusZoom,
    });
  }

  clearFocus() {
    this.focusLayer.getSource()?.clear();
    this.stopPulse();
  }

  clearRoute() {
    this.routeLayer.getSource()?.clear();
  }

  clear() {
    this.clearFocus();
    this.clearRoute();
    this.clearResources();
  }

  /** 幂等销毁：允许重复调用，也允许在地图实例已被替换后调用 */
  destroy() {
    this.stopPulse();
    const detach = (layer?: { dispose?: () => void } | null) => {
      if (!layer) return;
      if (isOlMap(this.map)) this.map.removeLayer(layer as never);
      layer.dispose?.();
    };
    this.wmsLayer?.getSource()?.dispose?.();
    detach(this.wmsLayer);
    detach(this.focusLayer);
    detach(this.routeLayer);
    this.wmsLayer = null as unknown as ImageLayer<ImageWMS>;
    this.focusLayer = null as unknown as VectorLayer<VectorSource>;
    this.routeLayer = null as unknown as VectorLayer<VectorSource>;
  }
}
