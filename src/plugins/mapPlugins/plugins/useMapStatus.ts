/*
 * @Author: hhr
 * @Date: 2026-04-21 19:55:07
 * @LastEditTime: 2026-04-21 20:01:31
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\plugins\mapPlugins\plugins\useMapStatus.ts
 */
import type OlMap from 'ol/Map';
import type BaseLayer from 'ol/layer/Base';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import type Feature from 'ol/Feature';
import type Geometry from 'ol/geom/Geometry';
import type { MapPlugin } from '../core/types';

export type LayerId = string;

export class MapStatusPlugin implements MapPlugin {
  public readonly key = 'mapStatus';
  private map?: OlMap;
  private readonly layers = new Map<LayerId, BaseLayer>();

  public apply(map: OlMap): void {
    this.map = map;
  }

  public addLayer(id: LayerId, layer: BaseLayer): this {
    this.layers.set(id, layer);
    this.map?.addLayer(layer);
    return this;
  }

  public getLayer<T extends BaseLayer = BaseLayer>(id: LayerId): T | undefined {
    return this.layers.get(id) as T | undefined;
  }

  public removeLayer(id: LayerId): boolean {
    const layer = this.layers.get(id);
    if (!layer || !this.map) return false;
    this.map.removeLayer(layer);
    this.layers.delete(id);
    return true;
  }

  public setLayerVisible(id: LayerId, visible: boolean): void {
    this.layers.get(id)?.setVisible(visible);
  }

  public setLayerOpacity(id: LayerId, opacity: number): void {
    this.layers.get(id)?.setOpacity(opacity);
  }

  public ensureVectorLayer(id: LayerId): VectorLayer<VectorSource> {
    const exist = this.getLayer<VectorLayer<VectorSource>>(id);
    if (exist) return exist;
    const layer = new VectorLayer({ source: new VectorSource() });
    this.addLayer(id, layer);
    return layer;
  }

  public addFeature(layerId: LayerId, feature: Feature<Geometry>): void {
    const layer = this.ensureVectorLayer(layerId);
    layer.getSource()?.addFeature(feature);
  }

  public clearFeatures(layerId: LayerId): void {
    this.getLayer<VectorLayer<VectorSource>>(layerId)?.getSource()?.clear();
  }

  public dispose(): void {
    if (!this.map) return;
    for (const [id] of this.layers) this.removeLayer(id);
    this.layers.clear();
    this.map = undefined;
  }
}

export const useMapStatus = () => new MapStatusPlugin();
