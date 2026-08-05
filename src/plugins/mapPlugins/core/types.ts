/*
 * @Author: hhr
 * @Date: 2026-04-21 19:54:53
 * @LastEditTime: 2026-04-21 19:59:48
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\plugins\mapPlugins\core\types.ts
 */
import type OlMap from 'ol/Map';

export type MaybePromise<T> = T | Promise<T>;

export type LngLat = [number, number];

export interface Disposable {
  dispose(): void;
}

export interface MapPlugin extends Disposable {
  readonly key: string;
  apply(map: OlMap): void;
}

export type MapPluginCtor<P extends MapPlugin, O = unknown> = new (options?: O) => P;
