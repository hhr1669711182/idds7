/*
 * @Author: hhr
 * @Date: 2026-04-21 19:54:55
 * @LastEditTime: 2026-04-21 20:01:14
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\plugins\mapPlugins\core\MapCore.ts
 */
import OlMap from 'ol/Map';
import View from 'ol/View';
import type BaseLayer from 'ol/layer/Base';
import type Control from 'ol/control/Control';
import type Interaction from 'ol/interaction/Interaction';
import type { MapPlugin, MapPluginCtor } from './types';

export interface MapCoreOptions {
  target: string | HTMLElement;
  layers?: BaseLayer[];
  controls?: Control[];
  interactions?: Interaction[];
  view?: View;
}

export class MapCore {
  public readonly map: OlMap;
  private readonly plugins = new Map<string, MapPlugin>();

  constructor(options: MapCoreOptions) {
    this.map = new OlMap({
      target: options.target,
      layers: options.layers,
      controls: options.controls,
      interactions: options.interactions,
      view: options.view ?? new View({
        center: [0, 0],
        zoom: 2,
      }),
    });
  }

  public use<P extends MapPlugin>(plugin: P): this;
  public use<P extends MapPlugin, O>(Plugin: MapPluginCtor<P, O>, options?: O): this;
  public use<P extends MapPlugin, O>(pluginOrCtor: P | MapPluginCtor<P, O>, options?: O): this {
    const plugin = typeof pluginOrCtor === 'function'
      ? new (pluginOrCtor as MapPluginCtor<P, O>)(options)
      : pluginOrCtor;

    plugin.apply(this.map);
    this.plugins.set(plugin.key, plugin);
    return this;
  }

  public get<P extends MapPlugin = MapPlugin>(key: string): P | undefined {
    return this.plugins.get(key) as P | undefined;
  }

  public remove(key: string): boolean {
    const p = this.plugins.get(key);
    if (!p) return false;
    p.dispose();
    this.plugins.delete(key);
    return true;
  }

  public destroy(): void {
    for (const [, p] of this.plugins) p.dispose();
    this.plugins.clear();
    this.map.setTarget(undefined);
  }
}
