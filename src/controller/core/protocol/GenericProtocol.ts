import { StyleKey } from "@/baseComponent/amap/featureStyle";

export interface LocateData {
  lngLat: [number, number];
  zoom: number;
  duration?: number;
}

export interface LayerToggleData {
  layerId: string;
  visible: boolean;
}

export interface LayerRefreshData {
  layerNames: string[];
  timestamp?: number;
}

export interface ClickData {
  lngLat: [number, number];
  pixel: { x: number; y: number };
  featureId: string;
}

export interface Overlay3DData {
  center: [number, number];
  highlightFloor: number;
  totalFloors: number;
}

export interface FitBoundsData {
  geometry: any; // GeoJSON.Polygon 等
  padding?: number[];
  duration?: number;
}

export interface PoiLocationData {
  longitude: number;
  latitude: number;
  zoom: number;
}

export interface MarkerAddData {
  id: string;
  lngLat: [number, number];
  iconUrl?: string;
  iconType?: StyleKey;
  iconParams?: Record<string, any>;
  animate?: string;
}

export interface TextData {
  id: string;
  lngLat: [number, number];
  text: string;
  subText?: string;
  arg?: any;
}

export interface PolygonDrawData {
  id: string;
  geometry: any; // GeoJSON.Polygon
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  animate?: string;
  style?: string;
}

export interface LineDrawData {
  id: string;
  coordinates: [number, number][];
  strokeColor?: string;
  width?: number;
}

export interface FeatureRemoveData {
  featureIds: string[];
  layerIds?: string[];
}

export interface FeatureVisibleData {
  featureId: string;
  visible: boolean;
}

export interface EsQueryData {
  geometry: {
    type: 'Circle' | 'Polygon';
    center?: [number, number];
    radius?: number;
    coordinates?: number[][][];
  };
  types: string[];
  limit: number;
}

export interface BufferCalcData {
  input: {
    center: [number, number];
    radius: number;
  };
  output?: string;
}

export interface RouteCalcData {
  start: [number, number];
  end: [number, number];
  strategy?: string;
}

export interface RouteCalcResult {
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

export interface SmoothMoveData {
  featureId: string;
  targetLngLat: [number, number];
  duration: number;
}

export interface TrackAppendData {
  lineId: string;
  newLngLat: [number, number];
}

export interface TrackPlayData {
  points: [number, number][];
  playSpeed: number;
}