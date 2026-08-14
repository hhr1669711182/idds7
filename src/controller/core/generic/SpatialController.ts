import { markRaw } from 'vue';
import OlMap from 'ol/Map';
import TileLayer from 'ol/layer/Tile';
import TileWMS from 'ol/source/TileWMS';
import { circle, point } from '@turf/turf';
import { fetchDrivingRoute } from '@/baseComponent/amap/useAmapTools';
import { geoserverApi } from '@/service/geoserver';
import type { EsQueryData, BufferCalcData, RouteCalcData, RouteCalcResult } from '../protocol';

export class SpatialController {
  private queryWmsLayer: TileLayer<TileWMS> | null = null;

  constructor(private map: OlMap) {}

  /**
   * [G-S01] 空间检索（WMS + CQL 圈内资源高亮）
   * 支持 Circle（DWITHIN）与 Polygon（INTERSECTS），参考 CircleQueryTool
   */
  public async esQuery(data: EsQueryData): Promise<any> {
    const cqlFilter = this.buildCqlFilter(data.geometry);
    if (!cqlFilter) return null;

    // 与 CircleQueryTool 一致：资源检索固定走聚合图层，types 仅作业务透传
    const layerName = 'gis:mapresource';
    const wmsParams = {
      LAYERS: layerName,
      VERSION: '1.1.0',
      FORMAT: 'image/png',
      TRANSPARENT: true,
      CQL_FILTER: cqlFilter,
    };

    if (!this.queryWmsLayer) {
      this.queryWmsLayer = markRaw(new TileLayer({
        source: markRaw(new TileWMS({
          url: geoserverApi.getWMSServiceUrl('gis'),
          params: wmsParams,
          serverType: 'geoserver',
          crossOrigin: 'anonymous',
        })),
        zIndex: 10,
      }));
      this.map.addLayer(this.queryWmsLayer);
    } else {
      this.queryWmsLayer.getSource()?.updateParams(wmsParams);
    }

    return { layerName, cqlFilter, types: data.types };
  }

  private buildCqlFilter(geometry: any): string | null {
    if (geometry?.type === 'Circle' && geometry.center && geometry.radius) {
      const [lng, lat] = geometry.center;
      return `1=1 and DWITHIN(geom,Point(${lng} ${lat}), ${geometry.radius},meters)`;
    }

    if (geometry?.type === 'Polygon' && geometry.coordinates?.[0]?.length) {
      const coords = geometry.coordinates[0];
      const wktPolygon = `POLYGON((${coords
        .map((c: number[]) => `${c[0]} ${c[1]}`)
        .join(', ')}))`;
      return `INTERSECTS(geom, ${wktPolygon})`;
    }

    return null;
  }

  /**
   * [G-S02] 动态缓冲缩圈
   */
  public calcBuffer(data: BufferCalcData) {
    if (!data.input?.center || !data.input?.radius) return null;

    try {
      const centerPoint = point([data.input.center[0], data.input.center[1]]);
      const buffered = circle(centerPoint, data.input.radius, { units: 'meters' });
      console.log("🚀 ~ SpatialController ~ calcBuffer ~ buffered:", buffered)
      // this.map.getView().fit(buffered.geometry?.coordinates?.[0] as any, { padding: [40, 40, 40, 40], duration: 300 });
      return buffered.geometry;
    } catch (e) {
      console.error('[G-S02] 缓冲计算失败', e);
      return null;
    }
  }

  /**
   * [G-S03] 路径规划算路（高德驾车，内联调用）
   */
  public async calcRoute(data: RouteCalcData): Promise<RouteCalcResult | null> {
    const key =
      localStorage.getItem('AMAP_WEBSERVICE_KEY') || '7405ae6dde247ee87be4e7d8021056f4';

    try {
      const strategy = data.strategy === 'fastest' ? 0 : Number(data.strategy) || 0;
      const result = await fetchDrivingRoute({
        key,
        origin: data.start,
        destination: data.end,
        strategy,
        extensions: 'all',
      });

      if (!result.fullPath.length) return null;

      return {
        coordinates: result.fullPath,
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
      };
    } catch (e) {
      console.error('[G-S03] 路径规划算路失败', e);
      return null;
    }
  }
}