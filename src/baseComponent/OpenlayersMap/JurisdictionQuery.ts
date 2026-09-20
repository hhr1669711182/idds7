/*
 * @Author: ljh
 * @Date: 2026-08-27 10:30:08
 * @LastEditTime: 2026-08-27 10:39:46
 * @LastEditors: ljh
 * @Description: 在普通地图中“点击消防队站，显示对应队站辖区”的独立查询模块。
 * @FilePath: src\baseComponent\OpenlayersMap\JurisdictionQuery.ts
 */
/** 视图范围 */
import type { EventsKey } from 'ol/events';
import type Feature from 'ol/Feature';
import GeoJSON from 'ol/format/GeoJSON';
import type Geometry from 'ol/geom/Geometry';
import VectorLayer from 'ol/layer/Vector';
import type Map from 'ol/Map';
import { unByKey } from 'ol/Observable';
import TileWMS from 'ol/source/TileWMS';
import VectorSource from 'ol/source/Vector';
import { Fill, Stroke, Style } from 'ol/style';
import { geoserverApi } from '@/service/geoserver';

export const STATION_LAYER_NAME = 'gis:view_res_org_dept';
export const JURISDICTION_LAYER_NAME = 'gis:view_juris_zone';

/** 普通地图中“点击消防队站，显示对应队站辖区”的独立查询模块。 */
export class JurisdictionQuery {
  private readonly source = new VectorSource<Feature<Geometry>>();
  private readonly layer: VectorLayer<VectorSource<Feature<Geometry>>>;
  private clickListener: EventsKey | null = null;
  private requestVersion = 0;

  constructor(private readonly map: Map) {
    this.layer = new VectorLayer({
      source: this.source,
      zIndex: 1000,
      style: new Style({
        fill: new Fill({ color: 'rgba(220, 38, 38, 0.18)' }),
        stroke: new Stroke({ color: '#dc2626', width: 3 }),
      }),
      properties: {
        id: 'station-jurisdiction-query',
        name: 'station-jurisdiction-query',
      },
    });
    this.map.addLayer(this.layer);
  }

  public activate(): void {
    if (this.clickListener) return;
    this.clickListener = this.map.on('singleclick', (event) => {
      void this.handleMapClick(event.coordinate);
    });
  }

  public deactivate(): void {
    if (this.clickListener) {
      unByKey(this.clickListener);
      this.clickListener = null;
    }
    this.clear();
  }

  public clear(): void {
    this.requestVersion += 1;
    this.source.clear();
  }

  public destroy(): void {
    this.deactivate();
    this.map.removeLayer(this.layer);
  }

  private async handleMapClick(coordinate: number[]): Promise<void> {
    const version = ++this.requestVersion;

    if (!this.isStationLayerVisible()) {
      this.source.clear();
      return;
    }

    try {
      const station = await this.queryClickedStation(coordinate);
      if (version !== this.requestVersion) return;

      const stationId = String(station?.properties?.id ?? '').trim();
      if (!stationId) {
        this.source.clear();
        return;
      }

      const data = await geoserverApi.getWFSFeatures({
        typeName: JURISDICTION_LAYER_NAME,
        cql_filter: `zone_id=${this.cqlLiteral(stationId)}`,
        outputFormat: 'application/json',
        srsName: 'EPSG:4326',
      }, 'gis');
      if (version !== this.requestVersion) return;

      if (data?.features?.length > 0) {
        this.showJurisdiction(data);
      } else {
        this.source.clear();
      }
    } catch (error) {
      if (version !== this.requestVersion) return;
      this.source.clear();
      console.error('Failed to query station jurisdiction:', error);
    }
  }

  private async queryClickedStation(coordinate: number[]): Promise<any | null> {
    const view = this.map.getView();
    const resolution = view.getResolution();
    if (!resolution) return null;

    const projection = view.getProjection();
    const source = new TileWMS({
      url: geoserverApi.getWMSServiceUrl('gis'),
      params: {
        LAYERS: STATION_LAYER_NAME,
        VERSION: '1.1.0',
      },
    });
    const url = source.getFeatureInfoUrl(
      coordinate,
      resolution,
      projection,
      { INFO_FORMAT: 'application/json', FEATURE_COUNT: 1 },
    );
    if (!url) return null;

    const urlObject = new URL(url, window.location.origin);
    const params = urlObject.searchParams;
    const data = await geoserverApi.getWMSFeatureInfo('gis', {
      layers: STATION_LAYER_NAME,
      query_layers: STATION_LAYER_NAME,
      bbox: params.get('BBOX') ?? params.get('bbox') ?? '',
      width: Number(params.get('WIDTH') ?? params.get('width')),
      height: Number(params.get('HEIGHT') ?? params.get('height')),
      x: Number(params.get('X') ?? params.get('x') ?? params.get('I') ?? params.get('i')),
      y: Number(params.get('Y') ?? params.get('y') ?? params.get('J') ?? params.get('j')),
      cql_filter: '1=1',
      feature_count: 1,
      transparent: true,
      format: 'image/png',
      srs: projection.getCode(),
    });

    return data?.features?.length > 0 ? data.features[0] : null;
  }

  private showJurisdiction(data: any): void {
    const features = new GeoJSON().readFeatures(data, {
      dataProjection: 'EPSG:4326',
      featureProjection: this.map.getView().getProjection(),
    });
    this.source.clear();
    this.source.addFeatures(features);
  }

  private isStationLayerVisible(): boolean {
    return this.map.getLayers().getArray().some(
      (layer) => layer.get('id') === STATION_LAYER_NAME && layer.getVisible(),
    );
  }

  private cqlLiteral(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }
}
