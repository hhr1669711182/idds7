/*
 * @Author: hhr
 * @Date: 2026-09-13 17:16:41
 * @LastEditTime: 2026-09-14 17:21:00
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\AddressRobotDrawer\data.ts
 */
import type { GisPayload, OsmPayload } from "./types";

/**
 * 内部数据源 - 直接调内部实现获取数据
 * 接入真实接口只需替换这两个函数实现
 */
export function loadGis(): GisPayload {
  return {
    raw_text: "我在科苑北路左边近 200 米的一个麦当劳这里",
    confidence: 86,
    highlight_entities: [
      { anchor_id: "A1", name: "科苑北路", anchor_type: "road", anchor_level: "AOI_2", highlight_role: "context",      lon: 113.9351, lat: 22.5479 },
      { anchor_id: "A2", name: "麦当劳",     anchor_type: "poi",  anchor_level: "POI",   highlight_role: "final_anchor", lon: 113.9385, lat: 22.5492 },
    ],
    spatial_relations: [
      { relation_type: "directional_offset", direction: "east", distance: 200, anchor_ids: ["A1", "A2"] },
      { relation_type: "target",                              anchor_ids: ["A2"] },
    ],
    target_anchor_id: "A2",
    radius: [0, 200],
    status: "resolved",
    highlight_shape: "circle",
  };
}

export function loadOsm(): OsmPayload {
  return { source: "GIS 前端", status: "ok", candidates: [] };
}
