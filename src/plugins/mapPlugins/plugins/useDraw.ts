/*
 * @Author: hhr
 * @Date: 2026-04-21 19:55:09
 * @LastEditTime: 2026-04-21 20:00:05
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\plugins\mapPlugins\plugins\useDraw.ts
 */
import type OlMap from 'ol/Map';
import { Draw, Modify, Snap } from 'ol/interaction';
import type { Type as OlGeometryType } from 'ol/geom/Geometry';
import { createBox, createRegularPolygon } from 'ol/interaction/Draw';
import type VectorLayer from 'ol/layer/Vector';
import type VectorSource from 'ol/source/Vector';
import type { MapPlugin } from '../core/types';

export type DrawType = GeometryType | 'Box' | 'Square';

type GeometryType = OlGeometryType;

export interface DrawPluginOptions {
  layer?: VectorLayer<VectorSource>;
  enableModify?: boolean;
  enableSnap?: boolean;
}

export interface DrawStartEndPayload {
  type: DrawType;
}

export class DrawPlugin implements MapPlugin {
  public readonly key = 'draw';
  private map?: OlMap;
  private draw?: Draw;
  private modify?: Modify;
  private snap?: Snap;
  private layer?: VectorLayer<VectorSource>;
  private readonly enableModify: boolean;
  private readonly enableSnap: boolean;

  constructor(options: DrawPluginOptions = {}) {
    this.layer = options.layer;
    this.enableModify = options.enableModify ?? true;
    this.enableSnap = options.enableSnap ?? true;
  }

  public apply(map: OlMap): void {
    this.map = map;
  }

  public start(type: 'Point', onEnd?: (e: any) => void): void;
  public start(type: 'LineString' | 'Polygon' | 'Circle' | 'Box' | 'Square', onEnd?: (e: any) => void): void;
  public start(type: DrawType, onEnd?: (e: any) => void): void {
    this.stop();
    if (!this.map) return;

    const source = this.layer?.getSource();
    if (!source) throw new Error('[DrawPlugin] layer with source required');

    const geometryFunction = type === 'Box'
      ? createBox()
      : type === 'Square'
        ? createRegularPolygon(4)
        : undefined;

    const drawType: GeometryType = (type === 'Box' || type === 'Square') ? 'Circle' : type;
    this.draw = new Draw({ source, type: drawType, geometryFunction });
    if (onEnd) this.draw.on('drawend', onEnd);
    this.map.addInteraction(this.draw);

    if (this.enableModify) {
      this.modify = new Modify({ source });
      this.map.addInteraction(this.modify);
    }
    if (this.enableSnap) {
      this.snap = new Snap({ source });
      this.map.addInteraction(this.snap);
    }
  }

  public bindLayer(layer: VectorLayer<VectorSource>): void {
    this.layer = layer;
  }

  public stop(): void {
    if (!this.map) return;
    if (this.draw) this.map.removeInteraction(this.draw);
    if (this.modify) this.map.removeInteraction(this.modify);
    if (this.snap) this.map.removeInteraction(this.snap);
    this.draw = undefined;
    this.modify = undefined;
    this.snap = undefined;
  }

  public dispose(): void {
    this.stop();
    this.map = undefined;
  }
}

export const useDraw = (options?: DrawPluginOptions) => new DrawPlugin(options);
