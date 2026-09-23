/**
 * 投影工具：3857 <-> 4326
 */
import { transform } from "ol/proj";
import type { Geometry } from "ol/geom";
import GeoJSON from "ol/format/GeoJSON";

export const toLngLat = (coord3857: number[]): [number, number] => {
  const [lon, lat] = transform(coord3857, "EPSG:3857", "EPSG:4326");
  return [lon, lat];
};

export const toMercator = (coord4326: [number, number]): [number, number] => {
  const [x, y] = transform([coord4326[0], coord4326[1]], "EPSG:4326", "EPSG:3857");
  return [x, y];
};

export const geometryToLngLat = (g3857: number[][] | number[][][]): typeof g3857 => {
  if (!g3857 || (Array.isArray(g3857) && g3857.length === 0)) return g3857;
  const isRing = Array.isArray(g3857[0]);
  if (!isRing) {
    return (g3857 as number[][]).map((c) => toLngLat(c));
  }
  return (g3857 as number[][][]).map((ring) => ring.map((c) => toLngLat(c)));
};

/**
 * 把 WFS 返回的 GeoJSON FeatureCollection 整体读成 OL Geometry(3857)
 * - dataProjection = 4326(GeoServer 默认)
 * - featureProjection = 3857(地图内部)
 */
export const readGeoJsonAsMercator = (raw: unknown): Geometry[] => {
  const fmt = new GeoJSON({
    dataProjection: "EPSG:4326",
    featureProjection: "EPSG:3857",
  });
  const features = fmt.readFeatures(raw as never);
  return features
    .map((f) => f.getGeometry())
    .filter((g): g is Geometry => !!g);
};
