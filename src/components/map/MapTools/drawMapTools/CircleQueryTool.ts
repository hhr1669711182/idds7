import { markRaw } from "vue";
import { Draw, Modify } from "ol/interaction";
import ImageLayer from "ol/layer/Image";
import ImageWMS from "ol/source/ImageWMS";
import { getDistance } from "ol/sphere";
import { transform } from "ol/proj";
import { Circle } from "ol/geom";
import { BaseTool } from "./BaseTool";
import Map from "ol/Map";
import { Type } from "ol/geom/Geometry";
import { Coordinate } from "ol/coordinate";
import Feature from "ol/Feature";
import { Style, Stroke, Fill } from "ol/style";
import { unByKey } from "ol/Observable";
import { EventsKey } from "ol/events";
import Overlay from "ol/Overlay";
import Collection from "ol/Collection";
import { geoserverApi } from "@/service/geoserver";
import { LAYER_NAMES } from "@/baseComponent/OpenlayersMap/layers";
import { EventBus } from "@/utils/mitt";
import { usePanelStore } from "@/store";
import { debounce } from "lodash-es";
export const ALL_RESOURCE_TYPES = [
  // { key: "ES", label: "聚合检索", layerName: "gis:mapresource", geomField: "geom", color: "#f56c6c" },
  { key: "fireHydrant", label: "消防栓", layerName: "gis:env_fire_water", geomField: "geom", color: "#f56c6c" },
  // { key: "fireWaterCrane", label: "消防水鹤", layerName: "gis:fire_water_crane", geomField: "geom", color: "#409eff" },
  // { key: "fireWaterPool", label: "消防水池", layerName: "gis:fire_water_pool", geomField: "geom", color: "#409eff" },
  { key: "keyUnit", label: "重点单位", layerName: "gis:view_env_enterprises", geomField: "geom", color: "#e6a23c" },
  // { key: "densePersonLocation", label: "人密场所", layerName: "gis:dense_person_location", geomField: "geom", color: "#909399" },
] as const;

export interface CircleQuerySourceData {
  centerLonLat: [number, number];
  radiusMeters: number;
  resourceTypes: string[];
  stats: {
    total: number;
    perType: Record<string, number>;
  };
}

export interface CircleQueryPatch {
  radiusMeters?: number;
  resourceTypes?: string[];
}

export class CircleQueryTool extends BaseTool {
  draw!: Draw;
  modify!: Modify;
  sketch!: Feature | null;
  listeners: EventsKey[] = [];
  radiusTooltip!: Overlay;
  radiusTooltipElement!: HTMLElement;
  wmsLayer!: ImageLayer<ImageWMS>;
  private moveendThrottle: ReturnType<typeof setTimeout> | null = null;
  private moveendLeading: boolean = false;
  private eventHandlers: { event: string; handler: any }[] = [];

  // 防抖后的查询方法
  private debouncedUpdateWMS = debounce(() => {
    if (this._centerLonLat[0] !== 0 && this._radiusMeters > 0) {
      this.updateWMSLayer(this._centerLonLat, this._radiusMeters);
    }
  }, 300);

  // 状态
  private _radiusMeters: number = 500;
  private _resourceTypes: string[] = ALL_RESOURCE_TYPES.map(t => t.key);
  private _centerLonLat: [number, number] = [0, 0];
  private _stats = { total: 0, perType: {} as Record<string, number> };

  /** 记录圈要素参数，供工具重启后恢复（需求 10：关闭后二次点击可继续编辑） */
  private static persistedCircle: { center: number[]; radius: number } | null = null;

  drawStyle = new Style({
    stroke: new Stroke({
      color: "#409eff",
      width: 2,
    }),
    fill: new Fill({
      color: "rgba(64, 158, 255, 0.1)",
    }),
  });

  constructor(options: { map: Map; type: Type; uuid: string; cb: Function }) {
    super(options);
  }

  getSourceData(): CircleQuerySourceData {
    return {
      centerLonLat: this._centerLonLat,
      radiusMeters: this._radiusMeters,
      resourceTypes: [...this._resourceTypes],
      stats: { ...this._stats },
    };
  }

  applyPatch(patch: CircleQueryPatch) {
    if (patch.radiusMeters !== undefined) {
      this._radiusMeters = patch.radiusMeters;
    }
    if (patch.resourceTypes !== undefined) {
      this._resourceTypes = [...patch.resourceTypes];
    }

    // 立即更新 UI（圆圈半径变化）
    if (this._centerLonLat[0] !== 0 && this._radiusMeters > 0) {
      const source = this.vectorLayer?.getSource();
      const feature = source?.getFeatureById(this.uuid);
      if (feature) {
        const geom = feature.getGeometry();
        geom.setRadius(this._radiusMeters);
        source.changed();
      }
    }

    // 防抖查询
    this.debouncedUpdateWMS();
  }

  private emitUpdate() {
    EventBus.emit("circle-query:update", this.getSourceData());
  }

  private emitClose() {
    EventBus.emit("circle-query:close");
  }

  init() {
    super.init();

    // 监听面板关闭
    const closeHandler = () => {
      this.destroy();
    };
    EventBus.on("circle-query:close", closeHandler);
    this.eventHandlers.push({ event: "circle-query:close", handler: closeHandler });

    this.radiusTooltipElement = document.createElement("div");
    this.radiusTooltipElement.className = "ol-tooltip ol-tooltip-measure";
    this.radiusTooltipElement.style.backgroundColor = "#ffcc33";
    this.radiusTooltipElement.style.padding = "4px 8px";
    this.radiusTooltipElement.style.border = "1px solid #fff";
    this.radiusTooltipElement.style.color = "#000";
    this.radiusTooltipElement.style.borderRadius = "4px";
    this.radiusTooltipElement.style.whiteSpace = "nowrap";

    this.radiusTooltip = markRaw(new Overlay({
      element: this.radiusTooltipElement,
      offset: [15, 0],
      positioning: "center-left",
    }));
    this.map.addOverlay(this.radiusTooltip);

    this.draw = markRaw(new Draw({
      source: this.vectorLayer?.getSource(),
      type: "Circle",
      style: this.drawStyle,
    }));

    this.map.addInteraction(this.draw);

    this.setHelpTooltip = (evt: { coordinate: Coordinate }) => {
      let helpMsg = this.sketch ? "松开鼠标结束圈选" : "点击并拖动鼠标进行圈选查询";
      this.helpTooltipElement.innerHTML = helpMsg;
      this.helpTooltipElement.style.display = "block";
      this.helpTooltip.setPosition(evt.coordinate);
    };

    this.map.on("pointermove", this.setHelpTooltip as any);

    // 需求 10：地图上只允许一个圈。已有圈时直接进入编辑态（二次拉半径），不再新建。
    if (this.restorePersistedCircle()) {
      return;
    }

    this.draw.on("drawstart", (evt: any) => {
      this.drawIng = true;
      this.sketch = evt.feature;
    });

    this.draw.on("drawend", (evt: any) => {
      this.drawIng = false;
      this.sketch = null;

      const feature = evt.feature as Feature<Circle>;
      feature.setId(this.uuid);
      feature.setStyle(this.drawStyle);

      // 绘制结束,触发一次 WMS 查询
      this.updateRadiusAndWMS(feature.getGeometry() as Circle, true);

      this.map.removeInteraction(this.draw);

      const featureCollection = markRaw(new Collection([feature]));
      this.modify = markRaw(new Modify({
        features: featureCollection,
      }));
      this.map.addInteraction(this.modify);

      // Modify 拖拽结束,触发 WMS 查询
      const modifyEndKey = this.modify.on("modifyend", (e: any) => {
        const features = e.features.getArray();
        if (features.length > 0) {
          const modifiedGeom = features[0].getGeometry() as Circle;
          this.updateRadiusAndWMS(modifiedGeom, true);
        }
      });
      this.listeners.push(modifyEndKey);

      // 地图缩放/平移结束后,节流触发 WMS 查询
      const moveEndKey = this.map.on("moveend", () => {
        if (this.moveendLeading) return;
        this.moveendLeading = true;
        this.moveendThrottle = setTimeout(() => {
          this.moveendLeading = false;
          this.moveendThrottle = null;
          if (this.wmsLayer) {
            const geom = feature.getGeometry() as Circle;
            this.updateRadiusAndWMS(geom, true);
          }
        }, 300);
      });
      this.listeners.push(moveEndKey);
    });
  }

  /**
   * 需求 10：恢复上次圈选的圆并直接挂 Modify，二次点击工具即可继续拉半径。
   * 没有历史圈时才返回 false，让调用方进入新建流程。
   */
  private restorePersistedCircle(): boolean {
    const persisted = CircleQueryTool.persistedCircle;
    const source = this.vectorLayer?.getSource?.();
    if (!persisted || !source) return false;

    // 清掉可能残留的历史圈，保证地图上只有一个
    source.getFeatures().forEach((item: Feature) => {
      if (item.getGeometry() instanceof Circle) source.removeFeature(item);
    });

    const feature = new Feature({
      id: this.uuid,
      geometry: new Circle(persisted.center, persisted.radius),
    });
    feature.setStyle(this.drawStyle);
    source.addFeature(feature);

    // 直接进入可编辑态
    this.map.removeInteraction(this.draw);
    this.modify = markRaw(new Modify({
      features: markRaw(new Collection([feature])),
    }));
    this.map.addInteraction(this.modify);

    const modifyEndKey = this.modify.on("modifyend", (e: any) => {
      const features = e.features.getArray();
      if (features.length > 0) {
        this.updateRadiusAndWMS(features[0].getGeometry() as Circle, true);
      }
    });
    this.listeners.push(modifyEndKey);

    const moveEndKey = this.map.on("moveend", () => {
      if (this.moveendLeading) return;
      this.moveendLeading = true;
      this.moveendThrottle = setTimeout(() => {
        this.moveendLeading = false;
        this.moveendThrottle = null;
        if (this.wmsLayer) this.updateRadiusAndWMS(feature.getGeometry() as Circle, true);
      }, 300);
    });
    this.listeners.push(moveEndKey);

    // 恢复半径提示与查询结果
    this.updateRadiusAndWMS(feature.getGeometry() as Circle, true);
    return true;
  }

  updateRadiusAndWMS(geom: Circle, triggerWms: boolean) {
    const center = geom.getCenter();
    const radius = geom.getRadius();
    const edgeCoordinate = [center[0] + radius, center[1]];
    const centerLonLat = transform(center, "EPSG:3857", "EPSG:4326");
    const edgeLonLat = transform(edgeCoordinate, "EPSG:3857", "EPSG:4326");
    const distanceInMeters = getDistance(centerLonLat, edgeLonLat);

    // 更新检索中心状态
    usePanelStore().setCircleCenter(centerLonLat);

    let displayRadius = "";
    if (distanceInMeters > 1000) {
      displayRadius = (distanceInMeters / 1000).toFixed(1) + "千米";
    } else {
      displayRadius = distanceInMeters.toFixed(1) + "米";
    }

    this.radiusTooltipElement.innerHTML = displayRadius;
    this.radiusTooltip.setPosition(edgeCoordinate);

    // 保存状态
    this._centerLonLat = centerLonLat as [number, number];
    this._radiusMeters = distanceInMeters;
    // 需求 10：记录当前圈的工具重启后可继续二次编辑
    CircleQueryTool.persistedCircle = { center: [...center], radius };

    if (triggerWms) {
      this.updateWMSLayer(centerLonLat, distanceInMeters);
    }

    // 发送更新事件
    this.emitUpdate();
  }

  updateWMSLayer(centerLonLat: number[], radiusInMeters: number) {
    const selectedTypes = ALL_RESOURCE_TYPES
      .filter(t => this._resourceTypes.includes(t.key));

    if (selectedTypes.length === 0) {
      const source = this.wmsLayer?.getSource();
      if (source) {
        source.updateParams({ CQL_FILTER: '1=0' });
      }
      this._stats = { total: 0, perType: {} };
      this.emitUpdate();
      return this;
    }

    const layers = selectedTypes.map(t => t.layerName).join(',');
    // 为每个图层生成单独的 filter，用分号分隔
    const filters = selectedTypes.map(() =>
      `DWITHIN(geom,Point(${centerLonLat[0]} ${centerLonLat[1]}),${radiusInMeters},meters)`
    );
    const cqlFilter = filters.join(';');

    if (!this.wmsLayer) {
      this.wmsLayer = markRaw(new ImageLayer({
        source: markRaw(new ImageWMS({
          url: geoserverApi.getWMSServiceUrl("gis"),
          params: {
            LAYERS: layers,
            VERSION: "1.1.0",
            FORMAT: "image/png",
            TRANSPARENT: true,
            CQL_FILTER: cqlFilter,
          },
          serverType: "geoserver",
          crossOrigin: "anonymous",
          ratio: 1.5,
        })),
        className: LAYER_NAMES.ES_WMS_LAYER,
        zIndex: 100,
      })) as ImageLayer<ImageWMS>;
      this.map.addLayer(this.wmsLayer);
    } else {
      const source = this.wmsLayer.getSource();
      if (source) {
        source.updateParams({ LAYERS: layers, CQL_FILTER: cqlFilter });
      }
    }

    this.updateStats(centerLonLat, radiusInMeters);
    return this;
  }

  /**
   * 更新统计数据（通过 WFS 查询每个图层的要素总数）
   */
  private async updateStats(centerLonLat: number[], radiusInMeters: number) {
    const selectedTypes = ALL_RESOURCE_TYPES
      .filter(t => this._resourceTypes.includes(t.key));

    if (selectedTypes.length === 0) {
      this._stats = { total: 0, perType: {} };
      this.emitUpdate();
      return;
    }

    const cqlFilter = `DWITHIN(geom,Point(${centerLonLat[0]} ${centerLonLat[1]}),${radiusInMeters},meters)`;
    const perType: Record<string, number> = {};
    let total = 0;

    try {
      const results = await Promise.all(
        selectedTypes.map(async (type) => {
          const res = await geoserverApi.getWFSFeatures({
            typeName: type.layerName,
            cql_filter: cqlFilter,
          });
          const count = res?.totalFeatures || res?.numberMatched || 0;
          return { key: type.key, count };
        })
      );

      // 汇总统计
      results.forEach(({ key, count }) => {
        perType[key] = count;
        total += count;
      });

      this._stats = { total, perType };
    } catch (err) {
      console.warn('[CircleQueryTool] updateStats failed:', err);
      this._stats = { total: 0, perType: {} };
    }

    // 统计数据更新完成后再发送事件
    this.emitUpdate();

  }
  /**
   * 需求 10：主动清空地图上的圈（面板「清空」入口），并重置可恢复状态，
   * 下次点击圈选工具会重新进入绘制流程。
   */
  clearCircle() {
    const source = this.vectorLayer?.getSource?.();
    if (source) {
      source.getFeatures().forEach((item: Feature) => {
        if (item.getGeometry() instanceof Circle) source.removeFeature(item);
      });
    }
    if (this.modify) {
      this.map.removeInteraction(this.modify);
      this.modify = undefined as unknown as Modify;
    }
    CircleQueryTool.persistedCircle = null;
    this._centerLonLat = [0, 0];
    this._stats = { total: 0, perType: {} };
    this._radiusMeters = 500;
    this.wmsLayer?.getSource()?.updateParams({ CQL_FILTER: "1=0" });
    this.emitUpdate();
  }
  destroy() {
    // 取消防抖
    this.debouncedUpdateWMS.cancel();
    // 清除 moveend 节流定时器
    if (this.moveendThrottle) {
      clearTimeout(this.moveendThrottle);
      this.moveendThrottle = null;
    }
    this.moveendLeading = false;
    // 断开所有事件监听
    this.listeners.forEach((key) => unByKey(key));
    this.listeners = [];
    // 清理 EventBus 监听
    this.eventHandlers.forEach(({ event, handler }) => {
      EventBus.off(event, handler);
    });
    this.eventHandlers = [];
    if (this.draw) {
      this.map.removeInteraction(this.draw);
    }
    if (this.modify) {
      this.map.removeInteraction(this.modify);
    }
    if (this.radiusTooltip) {
      this.map.removeOverlay(this.radiusTooltip);
    }
    this.map.un("pointermove", this.setHelpTooltip as any);
    super.destroy();
  }

  // clearES_WMSLayer() {
  //   if (this.wmsLayer) this.map.removeLayer(this.wmsLayer);
  // }
}
