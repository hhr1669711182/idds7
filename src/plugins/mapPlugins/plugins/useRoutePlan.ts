import type OlMap from 'ol/Map';
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { fromLonLat } from 'ol/proj';
import { Style, Stroke, Circle as CircleStyle, Fill } from 'ol/style';
import type { MapPlugin } from '../core/types';

import type { LngLat } from '../core/types';

export interface RoutePlanRequest {
  origin: LngLat;
  destination: LngLat;
  waypoints?: LngLat[];
}

export interface RoutePlanResult {
  path: LngLat[];
  distanceMeters?: number;
  durationSeconds?: number;
}

export type RoutePlanner = (req: RoutePlanRequest) => Promise<RoutePlanResult>;

export interface RoutePlanPluginOptions {
  planner: RoutePlanner;
  layerId?: string;
}

export class RoutePlanPlugin implements MapPlugin {
  public readonly key = 'routePlan';
  private map?: OlMap;
  private layer: VectorLayer<VectorSource>;

  constructor(private readonly options: RoutePlanPluginOptions) {
    this.layer = new VectorLayer({
      source: new VectorSource(),
      style: (f) => {
        const kind = f.get('kind');
        if (kind === 'route') {
          return new Style({ stroke: new Stroke({ color: '#2563EB', width: 5 }) });
        }
        return new Style({
          image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#EF4444' }), stroke: new Stroke({ color: '#fff', width: 2 }) }),
        });
      },
    });
  }

  public apply(map: OlMap): void {
    this.map = map;
    this.map.addLayer(this.layer);
  }

  public async plan(req: RoutePlanRequest): Promise<RoutePlanResult> {
    const result = await this.options.planner(req);
    this.render(req, result);
    return result;
  }

  public clear(): void {
    this.layer.getSource()?.clear();
  }

  private render(req: RoutePlanRequest, result: RoutePlanResult): void {
    this.clear();
    const toXY = (p: LngLat) => fromLonLat(p);
    const line = new Feature({
      geometry: new LineString(result.path.map(toXY)),
      kind: 'route',
    });
    const start = new Feature({ geometry: new Point(toXY(req.origin)), kind: 'start' });
    const end = new Feature({ geometry: new Point(toXY(req.destination)), kind: 'end' });
    this.layer.getSource()?.addFeatures([line, start, end]);
  }

  public dispose(): void {
    if (this.map) this.map.removeLayer(this.layer);
    this.layer.getSource()?.clear();
    this.map = undefined;
  }
}

export const useRoutePlan = (options: RoutePlanPluginOptions) => new RoutePlanPlugin(options);
