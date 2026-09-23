/**
 * 编辑态：维护 { featureId, geometry, properties, isDirty, mode }
 * 持久化由 engine 调用 insert/update/delete 完成。
 */
import { reactive, computed } from "vue";
import { toLngLat, geometryToLngLat } from "../utils/proj";
import type { MarkDrawLayer } from "../engine/types";
import type { StyleJson } from "../engine/types";
import { isWritable } from "../view/layerConfig";
import type Feature from "ol/Feature";

export type EditMode = "create" | "edit";

export interface EditorState {
  featureId: string | number | null;
  geometry3857: number[][] | number[][][];
  geometryLngLat: number[][] | number[][][];
  properties: Record<string, unknown>;
  style: StyleJson | null;
  isDirty: boolean;
  mode: EditMode;
  layerId: string | null;
}

export const useFeatureEditor = () => {
  const state = reactive<EditorState>({
    featureId: null,
    geometry3857: [],
    geometryLngLat: [],
    properties: {},
    style: null,
    isDirty: false,
    mode: "edit",
    layerId: null,
  });

  const reset = () => {
    state.featureId = null;
    state.geometry3857 = [];
    state.geometryLngLat = [];
    state.properties = {};
    state.style = null;
    state.isDirty = false;
    state.mode = "edit";
    state.layerId = null;
  };

  const loadFromFeature = (feature: Feature, layer: MarkDrawLayer | undefined) => {
    const geom = feature.getGeometry();
    if (geom) {
      const coords = (geom as unknown as { getCoordinates(): unknown }).getCoordinates();
      state.geometry3857 = coords as number[][] | number[][][];
      state.geometryLngLat = geometryToLngLat(state.geometry3857);
    }
    state.featureId = (feature.getId() as string | number) ?? null;
    state.properties = { ...feature.getProperties() };
    delete (state.properties as Record<string, unknown>)["_layerId"];
    delete (state.properties as Record<string, unknown>)["_isDirty"];
    state.style = null;
    state.isDirty = false;
    state.mode = "edit";
    state.layerId = layer?.id ?? null;
  };

  const markDirty = () => {
    state.isDirty = true;
  };

  const canSave = computed(
    () =>
      state.isDirty &&
      !!state.layerId &&
      isWritable({ id: state.layerId } as MarkDrawLayer)
  );

  const center = computed<[number, number] | null>(() => {
    const g = state.geometryLngLat;
    if (!Array.isArray(g) || g.length === 0) return null;
    const first = Array.isArray(g[0]) ? (g as number[][][])[0]?.[0] : (g as number[][])[0];
    return first ? toLngLat(first as number[]) : null;
  });

  return {
    state,
    reset,
    loadFromFeature,
    markDirty,
    canSave,
    center,
  };
};
