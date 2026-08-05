import type { Style } from 'ol/style';
import type OlMap from 'ol/Map';
import type { MapPlugin } from '../core/types';

export type StyleKey = string;
export type StyleFactory<P = any> = (params: P) => Style | Style[];

export interface FeatureStylePluginOptions {
  factories?: Record<string, StyleFactory<any>>;
}

export class FeatureStylePlugin implements MapPlugin {
  public readonly key = 'featureStyle';
  private readonly factories = new Map<StyleKey, StyleFactory<any>>();
  private readonly cache = new Map<string, Style | Style[]>();

  constructor(options: FeatureStylePluginOptions = {}) {
    Object.entries(options.factories ?? {}).forEach(([k, f]) => this.factories.set(k, f));
  }

  public apply(_map: OlMap): void {}

  public register<P>(key: StyleKey, factory: StyleFactory<P>): this {
    this.factories.set(key, factory as StyleFactory<any>);
    return this;
  }

  public get<P>(key: StyleKey, params: P, cacheKey?: string): Style | Style[] {
    const ck = cacheKey ?? `${key}:${JSON.stringify(params)}`;
    const hit = this.cache.get(ck);
    if (hit) return hit;
    const f = this.factories.get(key);
    if (!f) throw new Error(`[FeatureStylePlugin] style factory not found: ${key}`);
    const st = f(params);
    this.cache.set(ck, st);
    return st;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public dispose(): void {
    this.clearCache();
    this.factories.clear();
  }
}

export const useFeatureStyle = (options?: FeatureStylePluginOptions) => new FeatureStylePlugin(options);
