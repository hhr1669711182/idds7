/*
 * @Author: hhr
 * @Date: 2026-04-21 19:55:12
 * @LastEditTime: 2026-04-21 20:02:13
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\plugins\mapPlugins\plugins\useBusUpWMS.ts
 */
import type OlMap from 'ol/Map';
import TileLayer from 'ol/layer/Tile';
import ImageLayer from 'ol/layer/Image';
import TileWMS from 'ol/source/TileWMS';
import ImageWMS from 'ol/source/ImageWMS';
import type { MapPlugin } from '../core/types';

export type RequestClient = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface BusUpWmsPluginOptions {
  request?: RequestClient;
}

export interface WmsLayerOptions {
  id: string;
  url: string;
  params: Record<string, any>;
  serverType?: 'geoserver' | 'mapserver' | 'qgis';
  crossOrigin?: string;
  visible?: boolean;
}

export class BusUpWmsPlugin implements MapPlugin {
  public readonly key = 'busUpWMS';
  private map?: OlMap;
  private readonly layers = new Map<string, TileLayer<TileWMS> | ImageLayer<ImageWMS>>();

  constructor(private readonly options: BusUpWmsPluginOptions = {}) {}

  public apply(map: OlMap): void {
    this.map = map;
  }

  public addTile(options: WmsLayerOptions): TileLayer<TileWMS> {
    const layer = new TileLayer({
      source: new TileWMS({
        url: options.url,
        params: options.params,
        serverType: options.serverType,
        crossOrigin: options.crossOrigin ?? 'anonymous',
      }),
      visible: options.visible ?? true,
    });
    this.layers.set(options.id, layer);
    this.map?.addLayer(layer);
    return layer;
  }

  public addImage(options: WmsLayerOptions): ImageLayer<ImageWMS> {
    const layer = new ImageLayer({
      source: new ImageWMS({
        url: options.url,
        params: options.params,
        serverType: options.serverType,
        crossOrigin: options.crossOrigin ?? 'anonymous',
      }),
      visible: options.visible ?? true,
    });
    this.layers.set(options.id, layer);
    this.map?.addLayer(layer);
    return layer;
  }

  public remove(id: string): boolean {
    const layer = this.layers.get(id);
    if (!layer || !this.map) return false;
    this.map.removeLayer(layer);
    this.layers.delete(id);
    return true;
  }

  public async fetchText(url: string): Promise<string> {
    const req = this.options.request ?? fetch;
    const res = await req(url);
    return res.text();
  }

  public dispose(): void {
    if (!this.map) return;
    for (const [id] of this.layers) this.remove(id);
    this.layers.clear();
    this.map = undefined;
  }
}

export const useBusUpWMS = (options?: BusUpWmsPluginOptions) => new BusUpWmsPlugin(options);
