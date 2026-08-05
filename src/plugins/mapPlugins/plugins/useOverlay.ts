import Overlay, { type Positioning } from 'ol/Overlay';
import type OlMap from 'ol/Map';
import type { Coordinate } from 'ol/coordinate';
import type { MapPlugin } from '../core/types';

export type OverlayId = string;

export interface OverlayCreateOptions {
  id: OverlayId;
  coordinate: Coordinate;
  element?: HTMLElement;
  html?: string;
  className?: string;
  positioning?: Positioning;
  offset?: [number, number];
  stopEvent?: boolean;
}

export class OverlayPlugin implements MapPlugin {
  public readonly key = 'overlay';
  private map?: OlMap;
  private readonly overlays = new Map<OverlayId, Overlay>();

  public apply(map: OlMap): void {
    this.map = map;
  }

  public create(options: OverlayCreateOptions): Overlay {
    const el = options.element ?? (() => {
      const div = document.createElement('div');
      if (options.className) div.className = options.className;
      if (options.html != null) div.innerHTML = options.html;
      return div;
    })();

    const ov = new Overlay({
      element: el,
      positioning: options.positioning ?? 'bottom-center',
      offset: options.offset ?? [0, 0],
      stopEvent: options.stopEvent ?? true,
      position: options.coordinate,
    });

    this.overlays.set(options.id, ov);
    this.map?.addOverlay(ov);
    return ov;
  }

  public setPosition(id: OverlayId, coordinate: Coordinate): void {
    this.overlays.get(id)?.setPosition(coordinate);
  }

  public remove(id: OverlayId): boolean {
    const ov = this.overlays.get(id);
    if (!ov || !this.map) return false;
    this.map.removeOverlay(ov);
    this.overlays.delete(id);
    return true;
  }

  public dispose(): void {
    if (!this.map) return;
    for (const [, ov] of this.overlays) this.map.removeOverlay(ov);
    this.overlays.clear();
    this.map = undefined;
  }
}

export const useOverlay = () => new OverlayPlugin();
