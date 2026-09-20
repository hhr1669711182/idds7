/*
 * @Description: 地图控件插件，注册缩放滑块、全屏、比例尺、鹰眼、复位等常用控件
 */
import type OlMap from 'ol/Map';
import type Control from 'ol/control/Control';
import { FullScreen, OverviewMap, ScaleLine, ZoomSlider, ZoomToExtent } from 'ol/control';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import type { MapPlugin } from '../core/types';
import { readScaleLineUnit } from '../../../config/scaleLine.ts';

export type ControlId = string;

export interface CoreControlPluginOptions {
  defaults?: boolean;
  extent?: [number, number, number, number];
  overviewLayer?: TileLayer;
}

export class CoreControlPlugin implements MapPlugin {
  public readonly key = 'coreControl';
  private map?: OlMap;
  private readonly controls = new Map<ControlId, Control>();

  constructor(private readonly options: CoreControlPluginOptions = {}) {}

  public apply(map: OlMap): void {
    this.map = map;
    if (this.options.defaults !== false) {
      this.add('zoomSlider', new ZoomSlider());
      this.add('fullScreen', new FullScreen());
      this.add('scaleLine', new ScaleLine({ units: readScaleLineUnit() }));
      this.add('overview', new OverviewMap({
        layers: this.options.overviewLayer ? [this.options.overviewLayer] : [
          new TileLayer({
            source: new XYZ({
              url: "https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}",
              crossOrigin: "anonymous"
            })
          })
        ],
        collapsed: false,
        collapsible: true
      }));
      this.add('zoomToExtent', new ZoomToExtent({ extent: this.options.extent }));
    }
  }

  public add(id: ControlId, control: Control): this {
    this.controls.set(id, control);
    this.map?.addControl(control);
    return this;
  }

  public remove(id: ControlId): boolean {
    const c = this.controls.get(id);
    if (!c || !this.map) return false;
    this.map.removeControl(c);
    this.controls.delete(id);
    return true;
  }

  public dispose(): void {
    if (!this.map) return;
    for (const [, c] of this.controls) this.map.removeControl(c);
    this.controls.clear();
    this.map = undefined;
  }
}

export const useCoreControl = (options?: CoreControlPluginOptions) => new CoreControlPlugin(options);
