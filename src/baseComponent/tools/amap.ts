import TileLayer from "ol/layer/Tile.js";
import Projection from "ol/proj/Projection.js";
import {
  addCoordinateTransforms,
  addProjection,
  get as getProjection,
  type ProjectionLike,
} from "ol/proj.js";
import ImageTile from "ol/ImageTile.js";
import type { AttributionLike } from "ol/source/Source.js";
import XYZ, { type Options as XYZOptions } from "ol/source/XYZ.js";

import {
  gcj02ToWgs84,
  wgs84ToGcj02,
  type CoordinateTuple,
} from "./transform.ts";

export type AmapMapType =
  | "sat"
  | "base"
  | "label"
  | "traffic"
  | "offlinev1"
  | "offlinev2"
  | "dark";

export interface AmapSourceOptions extends Omit<
  XYZOptions,
  | "attributions"
  | "crossOrigin"
  | "projection"
  | "tileLoadFunction"
  | "tileUrlFunction"
  | "url"
  | "urls"
  | "wrapX"
> {
  mapType?: AmapMapType;
  gdSource?: string;
  offlineServer?: string;
  projection?: ProjectionLike;
  projectionTransformation?: boolean;
  attributions?: AttributionLike;
  crossOrigin?: string | null;
  wrapX?: boolean;
  visible?: boolean;
}

export const AMAP_PROJECTION_CODE = "GCJ-02";
export const AMAP_PROJECTION_EXTENT: [number, number, number, number] = [
  -20037508.342789244, -20037508.342789244, 20037508.342789244,
  20037508.342789244,
];

export const AMAP_ATTRIBUTION =
  '&copy; <a class="ol-attribution-amap" href="http://ditu.amap.com/">高德地图</a>';

type Coordinate = number[];
type TileLoadFunction = NonNullable<XYZOptions["tileLoadFunction"]>;
type TileUrlFunction = NonNullable<XYZOptions["tileUrlFunction"]>;

let gcj02Projection: Projection | null = null;

const stripTrailingSlash = (value: string) => value.replace(/\/+$/g, "");

const requireUrl = (value: string | undefined, label: string) => {
  const url = `${value ?? ""}`.trim();
  if (!url) {
    throw new Error(`[amap] ${label} is required for this map type`);
  }
  return stripTrailingSlash(url);
};

const forwardSphericalMercator = ([
  lon,
  lat,
]: CoordinateTuple): CoordinateTuple => {
  const maxLatitude = 85.0511287798;
  const radius = 6378137;
  const radPerDeg = Math.PI / 180;
  const clampedLat = Math.max(Math.min(maxLatitude, lat), -maxLatitude);
  const sin = Math.sin(clampedLat * radPerDeg);
  return [
    radius * lon * radPerDeg,
    (radius * Math.log((1 + sin) / (1 - sin))) / 2,
  ];
};

const inverseSphericalMercator = ([x, y]: CoordinateTuple): CoordinateTuple => {
  const radius = 6378137;
  const radPerDeg = Math.PI / 180;
  return [
    x / radius / radPerDeg,
    (2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) / radPerDeg,
  ];
};

const ll2gmerc = (input: Coordinate): Coordinate =>
  forwardSphericalMercator(wgs84ToGcj02(input[0], input[1]));

const gmerc2ll = (input: Coordinate): Coordinate =>
  gcj02ToWgs84(...inverseSphericalMercator([input[0], input[1]]));

const smerc2gmerc = (input: Coordinate): Coordinate =>
  forwardSphericalMercator(
    wgs84ToGcj02(...inverseSphericalMercator([input[0], input[1]])),
  );

const gmerc2smerc = (input: Coordinate): Coordinate =>
  forwardSphericalMercator(
    gcj02ToWgs84(...inverseSphericalMercator([input[0], input[1]])),
  );

export const registerGcj02Projection = () => {
  const existing = getProjection(AMAP_PROJECTION_CODE);
  if (existing) return existing;
  if (gcj02Projection) return gcj02Projection;

  gcj02Projection = new Projection({
    code: AMAP_PROJECTION_CODE,
    extent: AMAP_PROJECTION_EXTENT,
    units: "m",
  });

  addProjection(gcj02Projection);
  addCoordinateTransforms("EPSG:4326", gcj02Projection, ll2gmerc, gmerc2ll);
  addCoordinateTransforms(
    "EPSG:3857",
    gcj02Projection,
    smerc2gmerc,
    gmerc2smerc,
  );

  return gcj02Projection;
};

const buildGdUrl = (mapType: "sat" | "base" | "label", gdSource: string) => {
  const suffixMap = {
    sat: "?style=6&x={x}&y={y}&z={z}",
    base: "?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}",
    label: "?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
  } as const;

  return `${stripTrailingSlash(gdSource)}${suffixMap[mapType]}`;
};

const buildOfflineV1TileUrlFunction = (
  offlineServer: string,
): TileUrlFunction => {
  return (tileCoord) => {
    const z = tileCoord[0];
    const x = tileCoord[1];
    const row = Math.pow(2, z) + tileCoord[2];
    return `${stripTrailingSlash(offlineServer)}/baseMap/${z}/${x}/${row}.png`;
  };
};

const appendTimestamp: TileLoadFunction = (image, src) => {
  const separator = src.includes("?") ? "&" : "?";
  const element = (image as ImageTile).getImage();
  if (
    element instanceof HTMLImageElement ||
    element instanceof HTMLVideoElement
  ) {
    element.src = `${src}${separator}t=${Date.now()}`;
  }
};

const resolveSourceProjection = (
  options: AmapSourceOptions,
  gcjProjection: Projection,
) => {
  if (options.mapType === "offlinev1" && !options.projectionTransformation) {
    return options.projection;
  }
  return gcjProjection;
};

const resolveSourceConfig = (
  options: AmapSourceOptions,
  gcjProjection: Projection,
) => {
  const mapType = options.mapType ?? "base";
  const crossOrigin =
    options.crossOrigin ??
    (mapType === "sat" || mapType === "base" || mapType === "label"
      ? "anonymous"
      : null);

  if (mapType === "offlinev1") {
    const offlineServer = requireUrl(options.offlineServer, "offlineServer");
    return {
      projection: resolveSourceProjection(options, gcjProjection),
      crossOrigin,
      tileUrlFunction: buildOfflineV1TileUrlFunction(offlineServer),
    };
  }

  if (mapType === "offlinev2") {
    const offlineServer = requireUrl(options.offlineServer, "offlineServer");
    return {
      projection: gcjProjection,
      crossOrigin,
      url: `${offlineServer}/baseMap/{z}/{x}/{y}.png`,
    };
  }

  if (mapType === "traffic") {
    return {
      projection: gcjProjection,
      crossOrigin,
      url: "http://tm.amap.com/trafficengine/mapabc/traffictile?v=1.0&t=1&x={x}&y={y}&z={z}",
      tileLoadFunction: appendTimestamp,
    };
  }

  if (mapType === "dark") {
    return {
      projection: gcjProjection,
      crossOrigin,
      url: "https://map.geoq.cn/arcgis/rest/services/ChinaOnlineStreetPurplishBlue/MapServer/tile/{z}/{y}/{x}",
    };
  }

  const gdSource = requireUrl(options.gdSource, "gdSource");
  return {
    projection: gcjProjection,
    crossOrigin,
    url: buildGdUrl(mapType, gdSource),
  };
};

export const createAmapSource = (options: AmapSourceOptions = {}) => {
  const gcjProjection = registerGcj02Projection();
  const { attributions, wrapX, ...xyzOptions } = options;

  return new XYZ({
    ...xyzOptions,
    ...resolveSourceConfig(options, gcjProjection),
    // attributions: attributions ?? [AMAP_ATTRIBUTION],
    wrapX: wrapX ?? true,
  });
};

export const createAmapLayer = (options: AmapSourceOptions = {}) =>
  new TileLayer({
    source: createAmapSource(options),
  });
