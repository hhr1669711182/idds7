/**
 * MarkDraw 公共 barrel export
 */
export { createMarkDrawEngine } from "./engine/createMarkDrawEngine";
export type { CreateMarkDrawEngineResult } from "./engine/createMarkDrawEngine";
export type {
  MarkDrawFeature,
  MarkDrawLayer,
  MarkDrawGroup,
  MarkDrawToolType,
  MarkDrawEngineOptions,
  MarkDrawEventMap,
  MarkDrawEventName,
  StyleJson,
} from "./engine/types";

export { useLayerHierarchy } from "./view/useLayerHierarchy";
export {
  buildGroups,
  getLayer,
  getLayersByGroup,
  getAllLayers,
  isWritable,
  MARKDRAW_GROUP,
  MARKDRAW_LAYER,
  LAYER_WRITABLE_OVERRIDES,
} from "./view/layerConfig";

export {
  insertFeatures,
  updateFeatures,
  deleteFeatures,
  mixedTransaction,
} from "./form/wfst/transaction";

export { fetchFeatureTypeInfo, clearFeatureTypeCache } from "./utils/featureType";
export { styleToJson, styleFromJson } from "./utils/styleSerializer";
export { exportFeatureCollection, importFeatureCollection } from "./utils/geojson";
export { toLngLat, toMercator, geometryToLngLat } from "./utils/proj";

export { useMarkDrawStore } from "./store/useMarkDrawStore";
export { useMarkDraw } from "./composables/useMarkDraw";
export { useMarkDrawEmitter } from "./composables/useMarkDrawEmitter";

export { default as MarkDrawSurface } from "./components/MarkDrawSurface.vue";
export { default as MarkDrawToolbar } from "./components/MarkDrawToolbar.vue";
export { default as MarkDrawImporter } from "./components/MarkDrawImporter.vue";
export { default as LayerHierarchyPanel } from "./view/LayerHierarchyPanel.vue";
export { default as FeatureListPanel } from "./view/FeatureListPanel.vue";
export { default as FeatureEditorPanel } from "./form/FeatureEditorPanel.vue";
export { default as DemoPage } from "./demo/DemoPage.vue";
