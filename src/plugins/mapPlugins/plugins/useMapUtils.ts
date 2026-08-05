/*
 * @Author: hhr
 * @Date: 2026-04-21 19:55:16
 * @LastEditTime: 2026-04-21 20:02:29
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\plugins\mapPlugins\plugins\useMapUtils.ts
 */
import type OlMap from 'ol/Map';
import { fromLonLat } from 'ol/proj';
import type { Coordinate } from 'ol/coordinate';
import type { MapPlugin } from '../core/types';

import type { LngLat } from '../core/types';

export interface GeocodeResult {
  address: string;
  location: LngLat;
}

export interface MapUtilsOptions {
  geocode?: (address: string) => Promise<GeocodeResult[]>;
  reverseGeocode?: (location: LngLat) => Promise<GeocodeResult[]>;
}

export class MapUtilsPlugin implements MapPlugin {
  public readonly key = 'mapUtils';
  private map?: OlMap;

  constructor(private readonly options: MapUtilsOptions = {}) {}

  public apply(map: OlMap): void {
    this.map = map;
  }

  public flyTo(location: LngLat, zoom?: number, durationMs = 450): void {
    const view = this.map?.getView();
    if (!view) return;
    view.animate({ center: fromLonLat(location), zoom: zoom ?? view.getZoom(), duration: durationMs });
  }

  public animateTo(coordinate: Coordinate, zoom?: number, durationMs = 450): void {
    const view = this.map?.getView();
    if (!view) return;
    view.animate({ center: coordinate, zoom: zoom ?? view.getZoom(), duration: durationMs });
  }

  public geocode(address: string): Promise<GeocodeResult[]> {
    if (!this.options.geocode) return Promise.resolve([]);
    return this.options.geocode(address);
  }

  public reverseGeocode(location: LngLat): Promise<GeocodeResult[]> {
    if (!this.options.reverseGeocode) return Promise.resolve([]);
    return this.options.reverseGeocode(location);
  }

  public dispose(): void {
    this.map = undefined;
  }
}

export const useMapUtils = (options?: MapUtilsOptions) => new MapUtilsPlugin(options);
