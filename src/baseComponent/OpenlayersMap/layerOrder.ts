/** 调派地图业务图层顺序：车辆 > 消防站 > 路线 > 队站辖区。 */
export const MAP_LAYER_Z_INDEX = {
  jurisdiction: 1000,
  route: 1002,
  routeProgress: 1002.2,
  routeArrow: 1002.4,
  routeCheckpoint: 1002.6,
  routeEndpoint: 1002.8,
  fireStation: 1003,
  incident: 1003.5,
  vehicle: 1004,
} as const;
