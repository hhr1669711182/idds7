export type LngLat = [number, number];

export type RouteMetrics = {
  distanceIndexMeters: number[];
  totalDistanceMeters: number;
  lastMileStartDistanceMeters: number;
  lastMileStartPoint: LngLat | null;
};

const EARTH_RADIUS_METERS = 6371008.8;

const toRadians = (value: number) => (value * Math.PI) / 180;

export const distanceMeters = (a: LngLat, b: LngLat) => {
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const buildDistanceIndexMeters = (path: LngLat[]) => {
  const distances = [0];
  for (let i = 1; i < path.length; i++) {
    distances.push(distances[i - 1] + distanceMeters(path[i - 1], path[i]));
  }
  return distances;
};

export const interpolateLngLatOnDistance = (
  path: LngLat[],
  distances: number[],
  targetDistance: number,
): LngLat | null => {
  if (!path.length) return null;
  if (targetDistance <= 0) return path[0];

  const total = distances[distances.length - 1] ?? 0;
  if (targetDistance >= total) return path[path.length - 1];

  let i = 1;
  while (i < distances.length && distances[i] < targetDistance) i++;

  const d0 = distances[i - 1];
  const d1 = distances[i];
  const t = d1 === d0 ? 0 : (targetDistance - d0) / (d1 - d0);
  const [lng0, lat0] = path[i - 1];
  const [lng1, lat1] = path[i];
  return [lng0 + (lng1 - lng0) * t, lat0 + (lat1 - lat0) * t];
};

export const computeRouteMetrics = (
  path: LngLat[],
  lastMileMeters = 1000,
): RouteMetrics => {
  const validPath = path.filter(
    (p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]),
  );
  const distanceIndexMeters = buildDistanceIndexMeters(validPath);
  const totalDistanceMeters =
    distanceIndexMeters[distanceIndexMeters.length - 1] ?? 0;
  const lastMileStartDistanceMeters = Math.max(
    0,
    totalDistanceMeters - lastMileMeters,
  );

  return {
    distanceIndexMeters,
    totalDistanceMeters,
    lastMileStartDistanceMeters,
    lastMileStartPoint: interpolateLngLatOnDistance(
      validPath,
      distanceIndexMeters,
      lastMileStartDistanceMeters,
    ),
  };
};

export const formatCountdownSeconds = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
};
