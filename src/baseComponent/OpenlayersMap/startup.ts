import type Map from 'ol/Map';
import { unByKey } from 'ol/Observable.js';

/** Give visible base tiles the first loading window; a failed server must not block business UI. */
export function waitForBaseMap(map: Map, timeoutMs = 1500) {
  let finish!: () => void;
  const ready = new Promise<void>((resolve) => {
    const key = map.once('rendercomplete', () => finish());
    const timer = setTimeout(() => finish(), timeoutMs);
    finish = () => {
      clearTimeout(timer);
      unByKey(key);
      resolve();
    };
  });
  return { ready, cancel: () => finish() };
}
