import TileLayer from "ol/layer/Tile.js";
import TileGrid from "ol/tilegrid/TileGrid.js";
import XYZ from "ol/source/XYZ.js";
import type { ProjectionLike } from "ol/proj.js";

import { createAmapSource } from "../tools/amap.ts";
import { createBaiduSource } from "../tools/baidu.ts";
import { tileLoadFunction } from "../../util/mapTool.ts";
import { LAYER_NAMES } from "./layers.ts";

export type BaseSourceProviderId =
  | 'thunderforest'
  | "amap"
  | "baidu"
  // | "kailide"
  | "tianditu"
  | "google"
  | "offline"
  | "local";

export type BaseSourceMode = "image" | "road" | "transport"; 
export type BaseSourceModeType = "atlas" | "landscape" | "transport"; 
export type BaseSourceId = `${BaseSourceProviderId}-${BaseSourceMode}`;

export interface BaseSourceOption {
  id: BaseSourceId;
  providerId: BaseSourceProviderId;
  providerName: string;
  mode: BaseSourceMode;
  label: string;
  maxZoom?: number;
  supportsNightMode: boolean;
  createSource: () => XYZ;
}

export interface BaseSourceGroup {
  providerId: BaseSourceProviderId;
  providerName: string;
  options: BaseSourceOption[];
}

export interface BaseSourceCreateOptions {
  night?: boolean;
}

const env = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env ?? {};

const envOr = (key: string, fallback: string) => {
  const value = `${env[key] ?? ""}`.trim();
  return value || fallback;
};

const PROVIDERS: Record<BaseSourceProviderId, string> = {
  thunderforest: "ThunderForest",
  amap: "高德",
  baidu: "百度",
  // kailide: "凯立德",
  tianditu: "天地图",
  google: "谷歌地图",
  offline: "离线地图",
  local: "局部地图",
};

export const DEFAULT_BASE_SOURCE_ID: BaseSourceId = "thunderforest-road"; // 默认底图

const buildUrlSource = ({
  url,
  crossOrigin,
  projection,
  tileGrid,
}: {
  url: string;
  crossOrigin?: string | null;
  projection?: ProjectionLike;
  tileGrid?: TileGrid;
}) =>
  new XYZ({
    url,
    projection,
    tileGrid,
    crossOrigin,
    wrapX: true,
  });

const withNightFilter = (source: XYZ, enabled: boolean) => {
  if (enabled) {
    source.setTileLoadFunction(tileLoadFunction);
  }
  return source;
};

const createAmapRoadSource = () =>
  createAmapSource({
    mapType: "label", // base
    gdSource: "https://webrd01.is.autonavi.com/appmaptile",
  });

const createAmapImageSource = () =>
  createAmapSource({
    mapType: "sat",
    gdSource: "https://webst01.is.autonavi.com/appmaptile",
  });

const createBaiduRoadSource = () => createBaiduSource({ mapType: "road" });

const createBaiduImageSource = () => createBaiduSource({ mapType: "image" });

const createTiandituSource = (mode: BaseSourceMode) => {
  const tk = '4d49c5a7a297e1ba4629257fe2af76c1';
  // const tk = envOr("VITE_BASE_SOURCE_TIANDITU_TOKEN", "");
  const type = mode === "image" ? "img_w" : "vec_w";
  return buildUrlSource({
    url: `https://t0.tianditu.gov.cn/DataServer?T=${type}&x={x}&y={y}&l={z}&tk=${tk}`,
    crossOrigin: "anonymous",
  });
};

const createGoogleSource = (mode: BaseSourceMode) => {
  const url =
    mode === "image"
      ? "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
      : "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
  return buildUrlSource({ url, crossOrigin: "anonymous" });
};

const createThunderforestSource = (modeT: BaseSourceModeType) => {
  const apiKey = '6a53e8b25d114a5e9216df5bf9b5e9c8';
  const url = `https://{b-c}.tile.thunderforest.com/${modeT}/{z}/{x}/{y}.png?apikey=${apiKey}`;
  return buildUrlSource({ url, crossOrigin: "anonymous" });
};

const createKailideSource = (mode: BaseSourceMode) => {
  const key = mode === "image" ? "VITE_BASE_SOURCE_KAILIDE_IMAGE_URL" : "VITE_BASE_SOURCE_KAILIDE_ROAD_URL";
  return buildUrlSource({
    url: envOr(key, `/tiles/kailide/${mode}/{z}/{x}/{y}.png`),
  });
};

const createOfflineSource = (mode: BaseSourceMode) => {
  const key = mode === "image" ? "VITE_BASE_SOURCE_OFFLINE_IMAGE_URL" : "VITE_BASE_SOURCE_OFFLINE_ROAD_URL";
  return buildUrlSource({
    url: envOr(key, `/tiles/offline/${mode}/{z}/{x}/{y}.png`),
  });
};

const createLocalSource = (mode: BaseSourceMode) => {
  const key = mode === "image" ? "VITE_BASE_SOURCE_LOCAL_IMAGE_URL" : "VITE_BASE_SOURCE_LOCAL_ROAD_URL";
  return buildUrlSource({
    url: envOr(key, `/tiles/local/${mode}/{z}/{x}/{y}.png`),
  });
};

const SOURCE_DEFINITIONS: BaseSourceOption[] = [
  {
    id: "thunderforest-image",
    providerId: "thunderforest",
    providerName: PROVIDERS.thunderforest,
    mode: "image",
    label: "地形图",
    supportsNightMode: true,
    createSource: () => createThunderforestSource('landscape'),
    maxZoom: 19,
  },
  {
    id: "thunderforest-road",
    providerId: "thunderforest",
    providerName: PROVIDERS.thunderforest,
    mode: "road",
    label: "街道路网图",
    supportsNightMode: true,
    createSource: () => createThunderforestSource('atlas'),
    maxZoom: 19,
  },
  {
    id: "amap-image",
    providerId: "amap",
    providerName: PROVIDERS.amap,
    mode: "image",
    label: "影像图",
    supportsNightMode: true,
    createSource: createAmapImageSource,
    maxZoom: 18,
  },
  {
    id: "amap-road",
    providerId: "amap",
    providerName: PROVIDERS.amap,
    mode: "road",
    label: "街道路网图",
    supportsNightMode: true,
    createSource: createAmapRoadSource,
    maxZoom: 18,
  },
  {
    id: "baidu-image",
    providerId: "baidu",
    providerName: PROVIDERS.baidu,
    mode: "image",
    label: "影像图",
    supportsNightMode: false,
    createSource: createBaiduImageSource,
  },
  {
    id: "baidu-road",
    providerId: "baidu",
    providerName: PROVIDERS.baidu,
    mode: "road",
    label: "街道路网图",
    supportsNightMode: false,
    createSource: createBaiduRoadSource,
  },
  // {
  //   id: "kailide-image",
  //   providerId: "kailide",
  //   providerName: PROVIDERS.kailide,
  //   mode: "image",
  //   label: "影像图",
  //   supportsNightMode: true,
  //   createSource: () => createKailideSource("image"),
  // },
  // {
  //   id: "kailide-road",
  //   providerId: "kailide",
  //   providerName: PROVIDERS.kailide,
  //   mode: "road",
  //   label: "街道路网图",
  //   supportsNightMode: true,
  //   createSource: () => createKailideSource("road"),
  // },
  {
    id: "tianditu-image",
    providerId: "tianditu",
    providerName: PROVIDERS.tianditu,
    mode: "image",
    label: "影像图",
    supportsNightMode: false,
    createSource: () => createTiandituSource("image"),
    maxZoom: 18,
  },
  {
    id: "tianditu-road",
    providerId: "tianditu",
    providerName: PROVIDERS.tianditu,
    mode: "road",
    label: "街道路网图",
    supportsNightMode: false,
    createSource: () => createTiandituSource("road"),
    maxZoom: 18,
  },
  {
    id: "google-image",
    providerId: "google",
    providerName: PROVIDERS.google,
    mode: "image",
    label: "影像图",
    supportsNightMode: false,
    createSource: () => createGoogleSource("image"),
  },
  {
    id: "google-road",
    providerId: "google",
    providerName: PROVIDERS.google,
    mode: "road",
    label: "街道路网图",
    supportsNightMode: false,
    createSource: () => createGoogleSource("road"),
  },
  {
    id: "offline-image",
    providerId: "offline",
    providerName: PROVIDERS.offline,
    mode: "image",
    label: "影像图",
    supportsNightMode: true,
    createSource: () => createOfflineSource("image"),
  },
  {
    id: "offline-road",
    providerId: "offline",
    providerName: PROVIDERS.offline,
    mode: "road",
    label: "街道路网图",
    supportsNightMode: true,
    createSource: () => createOfflineSource("road"),
  },
  {
    id: "local-image",
    providerId: "local",
    providerName: PROVIDERS.local,
    mode: "image",
    label: "影像图",
    supportsNightMode: true,
    createSource: () => createLocalSource("image"),
  },
  {
    id: "local-road",
    providerId: "local",
    providerName: PROVIDERS.local,
    mode: "road",
    label: "街道路网图",
    supportsNightMode: true,
    createSource: () => createLocalSource("road"),
  },
];

export const BASE_SOURCE_OPTIONS = SOURCE_DEFINITIONS;

export const BASE_SOURCE_GROUPS: BaseSourceGroup[] = Object.entries(PROVIDERS).map(
  ([providerId, providerName]) => ({
    providerId: providerId as BaseSourceProviderId,
    providerName,
    options: BASE_SOURCE_OPTIONS.filter((option) => option.providerId === providerId),
  }),
);

export const isBaseSourceId = (value: string): value is BaseSourceId =>
  BASE_SOURCE_OPTIONS.some((option) => option.id === value);

export const getBaseSourceById = (id: string) =>
  BASE_SOURCE_OPTIONS.find((option) => option.id === id);

export const createBaseSourceSource = (
  id: string,
  options: BaseSourceCreateOptions = {},
  cb?: Function
) => {
  const sourceOption =
    getBaseSourceById(id) ??
    getBaseSourceById(DEFAULT_BASE_SOURCE_ID) ??
    BASE_SOURCE_OPTIONS[0];
  cb && cb(sourceOption.maxZoom ?? 20);
  const source = sourceOption.createSource();
  return withNightFilter(source, !!options.night && sourceOption.supportsNightMode);
};

export const createBaseSourceLayer = (
  id: string,
  layerName = LAYER_NAMES.AMAP_LAYER,
  options: BaseSourceCreateOptions = {},
) =>
  new TileLayer({
    className: layerName,
    source: createBaseSourceSource(id, options),
  });
