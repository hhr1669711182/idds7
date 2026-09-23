/**
 * 三级关系 composable：返回 groups / layers(groupId) / getLayer / isWritable
 */
import { buildGroups, getLayer, getLayersByGroup, isWritable, getAllLayers } from "./layerConfig";
import type { MarkDrawLayer } from "../engine/types";

export const useLayerHierarchy = () => ({
  groups: buildGroups(),
  getLayers: (groupId: string) => getLayersByGroup(groupId),
  getLayer: (id: string) => getLayer(id),
  isWritable: (layer: MarkDrawLayer | undefined) => (layer ? isWritable(layer) : false),
  allLayers: getAllLayers(),
});
