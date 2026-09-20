
import { SCALEPLATE_LIST } from "../const/const.map.ts";

export type ScaleLineUnit = (typeof SCALEPLATE_LIST)[number]["v"];
export const SCALE_UNIT_STORAGE_KEY = "map.scaleLineUnit";
export const DEFAULT_SCALE_UNIT: ScaleLineUnit = "metric";

export const readScaleLineUnit = (): ScaleLineUnit => {
  try {
    const saved = globalThis.localStorage?.getItem(SCALE_UNIT_STORAGE_KEY);
    return SCALEPLATE_LIST.find(({ v }) => v === saved)?.v ?? DEFAULT_SCALE_UNIT;
  } catch {
    return DEFAULT_SCALE_UNIT;
  }
};

export const saveScaleLineUnit = (unit: ScaleLineUnit): void => {
  try {
    globalThis.localStorage?.setItem(SCALE_UNIT_STORAGE_KEY, unit);
  } catch {
    // Storage may be blocked or full; the current map can still change units.
  }
};
