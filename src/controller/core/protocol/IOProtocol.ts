export interface MapViewChangedData {
  center: [number, number];
  zoom: number;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export interface MapFeaturePickData {
  incidentId: string;
  featureType: string;
  featureId: string;
  displayName: string;
  longitude: number;
  latitude: number;
}

export interface RoutePlanResultData {
  incidentId: string;
  routeId: string;
  eta: number;
  distance: number;
  recommended: boolean;
}

export interface MapLayerVisibleChangeData {
  incidentId: string;
  layers: Array<{ layerType: string; visible: boolean }>;
}

export interface LayerRefreshData {
  layerNames: string[];
  timestamp: number;
}

export interface MapViewStageConfigData {
  stage?: number;
  seat_id?: string;
  layerNames?: Array<{ layerId: string; visible: boolean }>;
}