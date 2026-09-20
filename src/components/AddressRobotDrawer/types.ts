/**
 * 类型 + 字典
 * 字段与 gis_search.json / backendResult.json 一一对齐
 */

/* ============ 类型 ============ */
export type RelationType = "directional_offset" | "target" | string;
export type HighlightRole = "context" | "final_anchor" | string;
export type Direction = "east" | "south" | "west" | "north" | string;

export interface AnchorEntity {
  anchor_id: string;
  name: string;
  anchor_type: string;
  anchor_level?: string;
  highlight_role?: HighlightRole;
  lon?: number;
  lat?: number;
  [k: string]: any;
}

export interface SpatialRelation {
  relation_type: RelationType;
  direction?: Direction;
  distance?: number;
  anchor_ids?: string[];
  [k: string]: any;
}

export interface GisPayload {
  raw_text?: string;
  confidence?: number;
  highlight_entities?: AnchorEntity[];
  spatial_relations?: SpatialRelation[];
  target_anchor_id?: string | null;
  radius?: [number, number];
  status?: string;
  highlight_shape?: string;
  [k: string]: any;
}

export interface OsmPayload {
  source?: string;
  status?: string;
  candidates?: any[];
  [k: string]: any;
}

/* ============ 字典（key→中文标签） ============ */
export const DICT: Record<string, Record<string, string>> = {
  level: { AOI_1: "主城区", AOI_2: "次城区", AOI_3: "地块", POI: "POI" },
  anchorType: { aoi: "AOI", poi: "POI", road: "道路", building: "建筑" },
  anchorRole: { context: "上下文", final_anchor: "主锚定物" },
  relation: { directional_offset: "方位偏移", target: "目标", absolute_direction: "绝对方向" },
  direction: { east: "东", south: "南", west: "西", north: "北" },
  status: { resolved: "已定位", ambiguous: "待澄清", partial: "部分结果" },
};

export const label = (group: string, key?: string, fallback = "''") =>
  (key ? DICT[group]?.[key] ?? key : fallback);


export const displayLabels = {
  status: {
    ok: '可定位',
    unknown: '未知',
    unsupported: '暂不支持',
    need_clarification: '需要追问',
    partial: '部分可定位',
    confirmed: '已确认',
    resolved: '已命中',
    ambiguous: '有歧义',
    ambiguous_parent_aoi: '多个区域候选',
    scope_no_candidate: '范围内未找到候选',
    unresolved: '未命中',
    disabled: '未启用'
  },
  anchorType: {
    loi: '道路',
    aoi: '区域',
    poi: '点位',
    road: '道路',
    named_place: '地点',
    building: '建筑',
    floor: '楼层',
    room: '房间'
  },
  level: {
    LOI: '道路',
    AOI_1: '行政区域',
    AOI_2: '片区',
    AOI_3: '最小围栏',
    POI_1: '建筑实体',
    POI_2: '楼层',
    POI_3: '楼层内点位'
  },
  role: {
    context: '主锚定物',
    final_anchor: '次锚定物',
    target: '目标',
    candidate: '候选'
  },
  relation: {
    directional_offset: '方位偏移',
    target: '目标',
    nearby: '附近',
    around: '周边',
    contains: '包含',
    inside: '内部',
    on: '位于',
    pass_through: '经过',
    same_as: '等同'
  },
  direction: {
    east: '东',
    west: '西',
    north: '北',
    south: '南',
    northeast: '东北',
    northwest: '西北',
    southeast: '东南',
    southwest: '西南',
    up: '上方',
    down: '下方',
    left: '左侧',
    right: '右侧'
  },
  shape: {
    line: '线状高亮',
    point: '点位高亮',
    polygon: '区域高亮',
    corridor: '沿线范围',
    radius: '半径范围',
    mixed: '组合高亮'
  },
  matchMethod: {
    exact: '精确匹配',
    alias: '别名匹配',
    fuzzy: '模糊匹配',
    pinyin: '拼音近似',
    child: '子节点匹配',
    unique_child: '唯一子节点'
  }
};