/*
 * @Author: hhr
 * @Date: 2026-09-22 18:23:54
 * @LastEditTime: 2026-10-12 14:45:52
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\MarkDraw\view\layerConfig.ts
 */
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

/**
 * 显式放开可写的业务图层。
 *
 * 队站辖区（gis:view_juris_zone）：GeoServer 与数据库侧均已具备写权限，
 * 编辑后的围栏几何通过 WFS-T 写入 zone_geom 字段，可正常落库。
 * 围栏的贴边吸附、交叠校验、撤销重做同样在本地可用。
 */
export const LAYER_WRITABLE_OVERRIDES: Record<string, boolean> = {
  "gis:view_juris_zone": true,
};

/**
 * 可写图层的真实 WFS typeName 覆盖：
 * 地图页面展示的 gis:view_juris_zone 是数据库视图，WFS-T 对它一律返回 read-only；
 * 真正可写的是同名的物理表 gis:juris_zone（视图 SQL = select * from public.juris_zone）。
 * 这里只在 MarkDraw 内做映射，不动 src/config/layers.ts，避免影响 map 页面的图层树。
 */
export const LAYER_TYPE_OVERRIDES: Record<string, string> = {
  "gis:view_juris_zone": "gis:juris_zone",
};


const toMarkDrawLayer = (cfg: LayerSourceConfig): MarkDrawLayer => ({
  groupId: cfg.groupId,
  groupName: cfg.groupName,
  groupOrder: cfg.groupOrder,
  id: cfg.id,
  name: cfg.name,
  workspace: cfg.workspace,
  typeName: LAYER_TYPE_OVERRIDES[cfg.id] ?? cfg.typeName,
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
