/**
 * 三级关系数据源：
 * - group / layer 从 @/config/layers 派生
 * - 新增 mark:mark_features 作为内置可写层（标绘专题组置顶）
 * - LAYER_WRITABLE_OVERRIDES 用于把某些业务图层显式放开为可写
 */
import { LAYER_SOURCE_CONFIGS, type LayerSourceConfig } from "@/config/layers";
import type { MarkDrawGroup, MarkDrawLayer } from "../engine/types";

export const MARKDRAW_GROUP: MarkDrawGroup = {
  groupId: "markdraw",
  groupName: "标绘专题",
  groupOrder: 99,
};

export const MARKDRAW_LAYER: MarkDrawLayer = {
  ...MARKDRAW_GROUP,
  id: "mark:mark_features",
  name: "我的标绘",
  workspace: "mark",
  typeName: "mark:mark_features",
  icon: "mdi:draw-pen",
  writable: true,
  displayFields: ["id", "name", "mark"],
};

export const LAYER_WRITABLE_OVERRIDES: Record<string, boolean> = {
  // 例如：'gis:view_env_enterprises': true,
};

const toMarkDrawLayer = (cfg: LayerSourceConfig): MarkDrawLayer => ({
  groupId: cfg.groupId,
  groupName: cfg.groupName,
  groupOrder: cfg.groupOrder,
  id: cfg.id,
  name: cfg.name,
  workspace: cfg.workspace,
  typeName: cfg.typeName,
  icon: cfg.icon,
  writable: cfg.enabled ? (LAYER_WRITABLE_OVERRIDES[cfg.id] ?? false) : false,
  displayFields: ["id", cfg.name],
});

const ALL_LAYERS: MarkDrawLayer[] = [
  MARKDRAW_LAYER,
  ...LAYER_SOURCE_CONFIGS.filter((c) => c.enabled !== false).map(toMarkDrawLayer),
];

const LAYER_BY_ID: Map<string, MarkDrawLayer> = new Map(
  ALL_LAYERS.map((l) => [l.id, l])
);

export const buildGroups = (): MarkDrawGroup[] => {
  const map = new Map<string, MarkDrawGroup>();
  ALL_LAYERS.forEach((l) => {
    if (!map.has(l.groupId)) {
      map.set(l.groupId, {
        groupId: l.groupId,
        groupName: l.groupName,
        groupOrder: l.groupOrder,
      });
    }
  });
  return Array.from(map.values()).sort((a, b) => a.groupOrder - b.groupOrder);
};

export const getLayersByGroup = (groupId: string): MarkDrawLayer[] =>
  ALL_LAYERS.filter((l) => l.groupId === groupId).sort((a, b) => a.name.localeCompare(b.name, "zh"));

export const getLayer = (id: string): MarkDrawLayer | undefined => LAYER_BY_ID.get(id);

export const isWritable = (layer: MarkDrawLayer): boolean => layer.writable === true;

export const getAllLayers = (): MarkDrawLayer[] => [...ALL_LAYERS];
