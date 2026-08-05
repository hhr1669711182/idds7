import {
  gcj02ToWgs84,
  wgs84ToGcj02,
  type CoordinateTuple,
} from "../tools/transform.ts";

export type LngLat = CoordinateTuple;

export const amapGcj02ToWgs84 = ([lng, lat]: LngLat): LngLat =>
  gcj02ToWgs84(lng, lat);

export const toAmapGcj02 = ([lng, lat]: LngLat): LngLat =>
  wgs84ToGcj02(lng, lat);

export const toAmapLngLatString = (lngLat: LngLat) => {
  const [lng, lat] = toAmapGcj02(lngLat);
  return `${lng},${lat}`;
};

export const parseAmapLocation = (location: string): LngLat | undefined => {
  const [lngText, latText] = `${location ?? ""}`.split(",");
  const lng = Number(lngText);
  const lat = Number(latText);

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return undefined;
  }

  return amapGcj02ToWgs84([lng, lat]);
};

export const parsePolyline = (polyline: string): LngLat[] => {
  if (!polyline) return [];

  return polyline
    .split(";")
    .map((pair) => parseAmapLocation(pair.trim()))
    .filter((point): point is LngLat => !!point);
};

export const parseMultiPolyline = (polylineGroup: string): LngLat[][] => {
  if (!polylineGroup) return [];

  return polylineGroup
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(parsePolyline)
    .filter((ring) => ring.length >= 3);
};
