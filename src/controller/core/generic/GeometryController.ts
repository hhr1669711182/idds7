import { offset } from 'ol/sphere';
/*
 * @Author: hhr
 * @Date: 2026-07-01 11:09:45
 * @LastEditTime: 2026-08-27 17:48:57
 * @LastEditors: hhr
 * @Description: 几何标绘控制器 - 支持业务ID分组清除
 * @FilePath: \ids-gis-web\src\controller\core\generic\GeometryController.ts
 */
import OlMap from 'ol/Map';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Style, Icon, Fill, Stroke, Text } from 'ol/style';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
import { getStyle, ROUTE_LINE_STROKE, StyleKey } from '@/baseComponent/amap/featureStyle';
import type { MarkerAddData, TextData, PolygonDrawData, LineDrawData, FeatureRemoveData, FeatureVisibleData } from '../protocol';

/** 要素类型前缀 - 用于区分同一业务ID下的不同要素类型 */
export const FEATURE_TYPE_PREFIX = {
  MARKER: 'marker_',
  POLYGON: 'polygon_',
  LINE: 'line_',
  CIRCLE: 'circle_',
  TEXT: 'text_'
} as const;

export class GeometryController {
  /** 存储 businessId -> featureIds[] 的映射，用于批量清除 */
  private businessIdMap: Map<string, string[]> = new Map();

  constructor(private map: OlMap, private tempVectorLayer: VectorLayer<VectorSource>) { }

  /**
   * 生成带类型前缀的 featureId
   * @param type 要素类型前缀
   * @param businessId 业务ID
   */
  private generateFeatureId(type: string, businessId: string): string {
    return `${type}${businessId}`;
  }

  /**
   * 解析 featureId 获取业务ID
   * @param featureId 带前缀的 featureId
   */
  private extractBusinessId(featureFeatureId: string): string | null {
    const prefixes = Object.values(FEATURE_TYPE_PREFIX);
    for (const prefix of prefixes) {
      if (featureFeatureId.startsWith(prefix)) {
        return featureFeatureId.substring(prefix.length);
      }
    }
    return null;
  }

  /**
   * 注册业务ID映射
   */
  private registerBusinessId(featureId: string, businessId: string): void {
    if (!businessId) return;

    let ids = this.businessIdMap.get(businessId);
    if (!ids) {
      ids = [];
      this.businessIdMap.set(businessId, ids);
    }
    if (!ids.includes(featureId)) {
      ids.push(featureId);
    }
  }

  /** marker / text 图层的 zIndex，确保显示在最顶层 */
  private static readonly MARKER_Z_INDEX = 10000;

  /**
   * [G-G01] 单点标绘引擎
   * @description 支持 businessId 分组，同一业务ID可绑定多个不同类型的要素；marker 始终显示在最顶层
   */
  public addMarker(data: MarkerAddData) {
    const source = this.tempVectorLayer.getSource();
    if (!source) return;

    // 生成带前缀的 featureId
    const featureId = this.generateFeatureId(FEATURE_TYPE_PREFIX.MARKER, data.id);
    let feature = source.getFeatureById(featureId) as Feature<Point> | undefined;
    const newGeometry = new Point(fromLonLat(data.lngLat));

    if (feature) {
      feature.setGeometry(newGeometry);
    } else {
      feature = new Feature({ geometry: newGeometry });
      feature.setId(featureId);
      source.addFeature(feature);
    }

    // 设置样式 - marker 始终在最顶层 (zIndex 最大)
    if (data.iconType) {
      feature.setStyle(getStyle(data.iconType as StyleKey, data?.iconParams));
      // feature.setStyle(new Style({
      //   zIndex: GeometryController.MARKER_Z_INDEX,
      //   image: baseStyle.getImage()
      // }));
    } else if (data.iconUrl) {
      feature.setStyle(new Style({
        zIndex: GeometryController.MARKER_Z_INDEX,
        image: new Icon({
          src: data.iconUrl,
          anchor: [0.5, 1],
          scale: 1
        })
      }));
    } else {
      // 无图标时也设置 zIndex
      feature.setStyle(new Style({ zIndex: GeometryController.MARKER_Z_INDEX }));
    }

    // 注册业务ID映射
    this.registerBusinessId(featureId, data.id);

    feature.changed();
    this.map.getView().setCenter(fromLonLat(data.lngLat));
  }

  /**
   * [G-G06] 文本标注
   * @description 在指定经纬度位置叠加 text + subText 两行文本标注，支持自定义样式。
   *              通过 businessId 分组，便于按业务批量清除。
   *
   * @example
   *   addText({
   *     id: 'label_zone_1',
   *     lngLat: [116.4, 39.9],
   *     text: '主战消防站',
   *     subText: '海淀区',
   *     arg: { fontColor: '#fff', backgroundColor: 'rgba(17,24,39,0.86)' }
   *   })
   */
  public addText(data: TextData) {
    const source = this.tempVectorLayer.getSource();
    if (!source) return;

    const featureId = this.generateFeatureId(FEATURE_TYPE_PREFIX.TEXT, data.id);
    const newGeometry = new Point(fromLonLat(data.lngLat));
    let feature = source.getFeatureById(featureId) as Feature<Point> | undefined;

    if (feature) {
      feature.setGeometry(newGeometry);
    } else {
      feature = new Feature({ geometry: newGeometry });
      feature.setId(featureId);
      source.addFeature(feature);
    }

    feature.setStyle(this.buildTextStyle(data));

    // 注册业务ID映射，与 marker / polygon 行为保持一致
    this.registerBusinessId(featureId, data.id);
    feature.changed();
  }

  /**
   * 构造文本标注样式：主文本 + 副文本两行，带半透明背景框
   * @description 所有视觉参数都允许通过 data.arg 覆盖，未传则使用默认值
   */
  private buildTextStyle(data: TextData): Style {
    const arg = (data.arg ?? {}) as {
      fontColor?: string;
      backgroundColor?: string;
      borderColor?: string;
      font?: string;
      padding?: [number, number, number, number];
      offsetY?: number;
      offsetX?: number;
    };

    const fontColor = arg.fontColor ?? '#FFFFFF';
    const backgroundColor = arg.backgroundColor ?? 'rgba(17, 24, 39, 0.86)';
    const borderColor = arg.borderColor ?? 'rgba(255,255,255,0.4)';
    const font = arg.font ?? '600 13px sans-serif';
    const padding = arg.padding ?? [4, 8, 4, 8];
    const offsetY = arg.offsetY ?? 0;
    const offsetX = arg.offsetX ?? 0;

    return new Style({
      zIndex: GeometryController.MARKER_Z_INDEX,
      text: new Text({
        text: data.subText
          ? `${data.text}\n${data.subText}`
          : data.text,
        offsetY,
        offsetX,
        font,
        fill: new Fill({ color: fontColor }),
        backgroundFill: new Fill({ color: backgroundColor }),
        stroke: new Stroke({ color: borderColor, width: 1 }),
        padding,
      }),
    });
  }

  /**
   * [G-G02] 多边形面高亮
   * @description 支持 businessId 分组，支持 style 区分主管/支撑围栏
   */
  public drawPolygon(data: PolygonDrawData) {
    const source = this.tempVectorLayer.getSource();
    if (!source || !data.geometry) return;

    // 生成带前缀的 featureId
    const featureId = this.generateFeatureId(FEATURE_TYPE_PREFIX.POLYGON, data.id);

    const geojsonFormat = new GeoJSON();
    let newGeometry: any;
    try {
      const parsedFeature: any = geojsonFormat.readFeature(
        { type: 'Feature', geometry: data.geometry },
        {
          dataProjection: 'EPSG:4326',
          featureProjection: this.map.getView().getProjection()
        }
      );
      newGeometry = parsedFeature.getGeometry();
    } catch (error) {
      console.error('[G-G02] 多边形面高亮解析失败', error);
      return;
    }

    let feature = source.getFeatureById(featureId) as Feature | undefined;

    if (feature) {
      feature.setGeometry(newGeometry);
      feature.setStyle(data.style === 'primary'
        ? this.getPrimaryFenceStyle(data)
        : this.getSecondaryFenceStyle(data));
      feature.changed();
    } else {
      feature = new Feature({ geometry: newGeometry });
      feature.setId(featureId);
      feature.setStyle(data.style === 'primary'
        ? this.getPrimaryFenceStyle(data)
        : this.getSecondaryFenceStyle(data));
      source.addFeature(feature);
    }

    // 注册业务ID映射
    this.registerBusinessId(featureId, data.id);
  }

  /**
   * [G-G04] 路径线绘制
   */
  public drawLine(data: LineDrawData) {
    const source = this.tempVectorLayer.getSource();
    if (!source || !data.coordinates?.length) return;

    // 生成带前缀的 featureId
    const featureId = this.generateFeatureId(FEATURE_TYPE_PREFIX.LINE, data.id);

    const geojsonFormat = new GeoJSON();
    let newGeometry: any;
    try {
      const parsedFeature: any = geojsonFormat.readFeature(
        { type: 'Feature', geometry: { type: 'LineString', coordinates: data.coordinates } },
        { featureProjection: this.map.getView().getProjection() }
      );
      newGeometry = parsedFeature.getGeometry();
    } catch (error) {
      console.error('[G-G04] 路径线绘制失败', error);
      return;
    }

    let feature = source.getFeatureById(featureId) as Feature | undefined;

    if (feature) {
      feature.setGeometry(newGeometry);
      feature.setStyle(new Style({
        stroke: new Stroke({
          color: data.strokeColor || ROUTE_LINE_STROKE,
          width: data.width ?? 4,
        }),
      }));
      feature.changed();
    } else {
      feature = new Feature({ geometry: newGeometry });
      feature.setId(featureId);
      feature.setStyle(new Style({
        stroke: new Stroke({
          color: data.strokeColor || ROUTE_LINE_STROKE,
          width: data.width ?? 4,
        }),
      }));
      source.addFeature(feature);
    }

    // 注册业务ID映射
    this.registerBusinessId(featureId, data.id);
  }

  /**
   * [G-G05] 单要素显隐
   */
  public setFeatureVisible(data: FeatureVisibleData) {
    const source = this.tempVectorLayer.getSource();
    const feature = source?.getFeatureById(data.featureId);
    if (!feature) return;

    if (data.visible) {
      const saved = feature.get('_restoredStyle');
      if (saved) {
        feature.setStyle(saved);
        feature.unset('_restoredStyle');
      }
    } else {
      if (!feature.get('_restoredStyle')) {
        feature.set('_restoredStyle', feature.getStyle());
      }
      feature.setStyle(() => undefined);
    }
    feature.changed();
  }

  /**
   * [G-G03] 要素批量移除 - 支持精确清除
   * @description 支持两种模式：
   * 1. 传入带前缀的 featureId（如 marker_zone_123）- 精确清除
   * 2. 传入原始的 businessId（如 zone_123）- 自动清除该ID下所有要素
   */
  public removeFeature(data: FeatureRemoveData) {
    const source = this.tempVectorLayer.getSource();
    if (!source) return;

    data.featureIds.forEach(id => {
      // 1. 先尝试直接查找（兼容带前缀的 featureId）
      let feature = source.getFeatureById(id);

      if (feature) {
        // 找到了，直接移除
        source.removeFeature(feature);
        // 同步清理映射
        const businessId = this.extractBusinessId(id);
        if (businessId) {
          this.removeFromBusinessIdMap(id, businessId);
        }
      } else {
        // 2. 找不到，则按 businessId 批量清除（兼容原始ID）
        this.clearByBusinessId(id);
      }
    });
  }

  /**
   * 从 businessIdMap 中移除指定 featureId
   */
  private removeFromBusinessIdMap(featureId: string, businessId: string): void {
    const ids = this.businessIdMap.get(businessId);
    if (ids) {
      const index = ids.indexOf(featureId);
      if (index > -1) ids.splice(index, 1);
      if (ids.length === 0) this.businessIdMap.delete(businessId);
    }
  }

  /**
   * 按业务ID批量清除 - 新增方法
   * @param businessId 业务ID，将清除该业务ID下的所有要素（marker、polygon、line等）
   * @description 用于业务场景切换时，一次性清除所有相关要素
   */
  public clearByBusinessId(businessId: string) {
    const featureIds = this.businessIdMap.get(businessId);
    if (!featureIds || featureIds.length === 0) return;

    const source = this.tempVectorLayer.getSource();
    if (!source) return;

    featureIds.forEach(id => {
      const feature = source.getFeatureById(id);
      if (feature) {
        source.removeFeature(feature);
      }
    });

    // 清除映射记录
    this.businessIdMap.delete(businessId);
  }

  /**
   * 按业务ID前缀批量清除 - 新增方法
   * @param businessIdPrefix 业务ID前缀，匹配的业务ID都会被清除
   */
  public clearByBusinessIdPrefix(businessIdPrefix: string) {
    const source = this.tempVectorLayer.getSource();
    if (!source) return;

    // 查找所有匹配前缀的业务ID
    const matchedBusinessIds: string[] = [];
    this.businessIdMap.forEach((_, businessId) => {
      if (businessId.startsWith(businessIdPrefix)) {
        matchedBusinessIds.push(businessId);
      }
    });

    // 批量清除
    matchedBusinessIds.forEach(businessId => {
      this.clearByBusinessId(businessId);
    });
  }

  /**
   * 获取业务ID下的所有要素ID
   */
  public getFeatureIdsByBusinessId(businessId: string): string[] {
    return this.businessIdMap.get(businessId) || [];
  }

  /**
   * 获取主管围栏样式（高对比度醒目色）
   */
  private getPrimaryFenceStyle(data: PolygonDrawData): Style {
    return new Style({
      fill: new Fill({ color: data?.fillColor || 'rgba(255, 60, 60, 0.3)' }),
      stroke: new Stroke({ color: data?.strokeColor || '#ff3c3c', width: 3 })
    });
  }

  /**
   * 获取支撑围栏样式（次级弱对比色）
   */
  private getSecondaryFenceStyle(data: PolygonDrawData): Style {
    return new Style({
      fill: new Fill({ color: data?.fillColor || 'rgba(100, 150, 255, 0.2)' }),
      stroke: new Stroke({ color: data?.strokeColor || '#6496ff', width: 2 })
    });
  }
}




