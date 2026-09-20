export type ZhxfStationData = {
  id: string;
  lng: number;
  lat: number;
  title: string;
  address: string;
  phone?: string;
  deviceTotal: number;
  deviceOnline: number;
  deviceGoouts: number;
  /** AMap=历史高德校准静态数据；WFS=GeoServer gis:view_res_org_dept（EPSG:4326） */
  source: "AMap" | "WFS";
};

/* ============================================================================
 * 历史：临时前端主管队站静态数据（已停用，保留备查，确认无回滚需要后可整体删除）
 * 数据来源已改为 GeoServer WFS 图层 gis:view_res_org_dept（EPSG:4326，无需坐标转换），
 * 获取与格式转换见 @/composables/useFireStations.ts。
 * ----------------------------------------------------------------------------
 *
 * import { gcj02ToWgs84 } from "../tools/transform.ts";
 *
 * const fromGcj02Data = <T extends { lng: number; lat: number }>(
 *   item: T,
 * ): T => {
 *   const [lng, lat] = gcj02ToWgs84(item.lng, item.lat);
 *   return {
 *     ...item,
 *     lng,
 *     lat,
 *   };
 * };
 *
 * // 临时前端主管队站数据：坐标和地址由高德 Web 服务校准，后续对接接口后可整体移除。
 * const rawZhxfdzXYList: ZhxfStationData[] = [
 *   {
 *     id: "SZNS-001",
 *     lng: 113.930783,
 *     lat: 22.543345,
 *     title: "深圳市消防救援支队南山区大队",
 *     address: "广东省深圳市南山区南头街道桃园路193号",
 *     phone: "0755-86668119",
 *     deviceTotal: 20,
 *     deviceOnline: 20,
 *     deviceGoouts: 7,
 *     source: "AMap",
 *   },
 *   {
 *     id: "SZNS-002",
 *     lng: 113.921456,
 *     lat: 22.537654,
 *     title: "南头消防救援站",
 *     address: "广东省深圳市南山区南头街与南新路交叉口西北100米",
 *     phone: "0755-26565119",
 *     deviceTotal: 10,
 *     deviceOnline: 10,
 *     deviceGoouts: 3,
 *     source: "AMap",
 *   },
 *   {
 *     id: "SZNS-003",
 *     lng: 113.951234,
 *     lat: 22.528765,
 *     title: "南山消防救援站",
 *     address: "广东省深圳市南山区南山大道1138号",
 *     phone: "0755-26648119",
 *     deviceTotal: 8,
 *     deviceOnline: 8,
 *     deviceGoouts: 2,
 *     source: "AMap",
 *   },
 *   {
 *     id: "SZNS-004",
 *     lng: 113.976543,
 *     lat: 22.532109,
 *     title: "蛇口消防救援站",
 *     address: "广东省深圳市南山区蛇口太子路18号",
 *     phone: "0755-26693119",
 *     deviceTotal: 10,
 *     deviceOnline: 10,
 *     deviceGoouts: 3,
 *     source: "AMap",
 *   },
 *   {
 *     id: "SZNS-005",
 *     lng: 114.001234,
 *     lat: 22.545678,
 *     title: "科技园消防救援站",
 *     address: "广东省深圳市南山区科技园高新南六道16号",
 *     phone: "0755-86158119",
 *     deviceTotal: 12,
 *     deviceOnline: 12,
 *     deviceGoouts: 4,
 *     source: "AMap",
 *   },
 *   {
 *     id: "SZNS-006",
 *     lng: 113.939876,
 *     lat: 22.576543,
 *     title: "西丽消防救援站",
 *     address: "广东省深圳市南山区西丽街道留仙大道2002号",
 *     phone: "0755-26528119",
 *     deviceTotal: 15,
 *     deviceOnline: 15,
 *     deviceGoouts: 5,
 *     source: "AMap",
 *   },
 *   {
 *     id: "SZNS-007",
 *     lng: 114.012345,
 *     lat: 22.523456,
 *     title: "华侨城消防救援站",
 *     address: "广东省深圳市南山区华侨城深南大道9009号",
 *     phone: "0755-26918119",
 *     deviceTotal: 9,
 *     deviceOnline: 9,
 *     deviceGoouts: 2,
 *     source: "AMap",
 *   },
 *   {
 *     id: "SZNS-008",
 *     lng: 113.956789,
 *     lat: 22.590123,
 *     title: "桃源消防救援站",
 *     address: "广东省深圳市南山区桃源街道留仙大道4168号",
 *     phone: "0755-26768119",
 *     deviceTotal: 9,
 *     deviceOnline: 9,
 *     deviceGoouts: 3,
 *     source: "AMap",
 *   },
 * ];
 *
 * export const zhxfdzXYList: ZhxfStationData[] =
 *   rawZhxfdzXYList.map(fromGcj02Data);
 * ============================================================================ */

export type JRAlarmStatus = "接警" | "调派" | "途中" | "处置" | "归队";

export type JRAlarmData = {
  incidentId: string
  incidentState?: string
  incidentStateName?: string
  disasterType: string
  disasterTypeLabel: string
  disasterGrade: string
  disasterGradeLabel: string | null
  disasterAddress: string
  lng: number
  lat: number
  inquiryId: string
  mOrgId: string
  mOrgIdLabel: string | null
  buildingProfileId: string | null
  disasterProfileId: string
  version: number
  type: 'fire' | 'rescue' | 'society'
  colorType: 'blue' | 'red' | 'grey' | 'def'
  createdAt?: string
}
