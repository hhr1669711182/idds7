/*
 * @Description: 底图插件，管理多套底图（XYZ/自定义图层）的注册、切换与显隐
 */
import TileLayer from 'ol/layer/Tile';
import type BaseLayer from 'ol/layer/Base';
import XYZ from 'ol/source/XYZ';
import type OlMap from 'ol/Map';
import type { MapPlugin } from '../core/types';

export type BaseMapId = string;

export type BaseMapDefinition =
  | { id: BaseMapId; layer: BaseLayer }
  | { id: BaseMapId; xyzUrl: string; crossOrigin?: string; attributions?: string[] };

export interface BaseMapPluginOptions {
  maps?: BaseMapDefinition[];
  initial?: BaseMapId;
}

export class BaseMapPlugin implements MapPlugin {
  public readonly key = 'baseMap';
  private map?: OlMap;
  public baseLayer?: TileLayer;
  public overviewLayer?: TileLayer;
  private active?: BaseMapId;
  private readonly layers = new Map<BaseMapId, BaseLayer>();

  constructor(private readonly options: BaseMapPluginOptions = {}) {}

  public apply(map: OlMap): void {
    this.map = map;
    (this.options.maps ?? []).forEach((m) => this.register(m));
    const init = this.options.initial ?? this.active ?? (this.options.maps?.[0] as any)?.id;
    if (init) this.setActive(init);
  }

  public register(def: BaseMapDefinition): this {
    const layer = 'layer' in def
      ? def.layer
      : new TileLayer({
          source: new XYZ({
            url: def.xyzUrl,
            crossOrigin: def.crossOrigin ?? 'anonymous',
            attributions: def.attributions,
          }),
        });
    this.layers.set(def.id, layer);
    this.map?.addLayer(layer);
    layer.setVisible(false);
    if (!this.active) this.active = def.id;
    return this;
  }

  public setActive(id: BaseMapId): void {
    this.active = id;
    for (const [k, l] of this.layers) l.setVisible(k === id);
  }

  public getActive(): BaseMapId | undefined {
    return this.active;
  }

  public getLayer(id: BaseMapId): BaseLayer | undefined {
    return this.layers.get(id);
  }

  public dispose(): void {
    if (!this.map) return;
    for (const [, l] of this.layers) this.map.removeLayer(l);
    this.layers.clear();
    this.map = undefined;
  }
}

export const useBaseMap = (options?: BaseMapPluginOptions) => new BaseMapPlugin(options);
