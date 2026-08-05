export type CoordinateTuple = [number, number];

const X_PI = (Math.PI * 3000.0) / 180.0;
const PI = Math.PI;
const AXIS = 6378245.0;
const OFFSET = 0.00669342162296594323;

const toNumber = (value: number) => Number(value);

const isOutOfChina = (lon: number, lat: number) =>
  lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;

const transformLat = (x: number, y: number) => {
  let ret =
    -100.0 +
    2.0 * x +
    3.0 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * (2.0 / 3.0);
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y * PI) / 3.0)) * (2.0 / 3.0);
  ret +=
    (160.0 * Math.sin((y * PI) / 12.0) + 320.0 * Math.sin((y * PI) / 30.0)) *
    (2.0 / 3.0);
  return ret;
};

const transformLon = (x: number, y: number) => {
  let ret =
    300.0 +
    x +
    2.0 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * (2.0 / 3.0);
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x * PI) / 3.0)) * (2.0 / 3.0);
  ret +=
    (150.0 * Math.sin((x * PI) / 12.0) + 300.0 * Math.sin((x * PI) / 30.0)) *
    (2.0 / 3.0);
  return ret;
};

const delta = (lon: number, lat: number): CoordinateTuple => {
  const dLat = transformLat(lon - 105.0, lat - 35.0);
  const dLon = transformLon(lon - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - OFFSET * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const outLat = (dLat * 180.0) / (((AXIS * (1 - OFFSET)) / (magic * sqrtMagic)) * PI);
  const outLon = (dLon * 180.0) / ((AXIS / sqrtMagic) * Math.cos(radLat) * PI);
  return [outLon, outLat];
};

export function bd09ToGcj02(lon: number, lat: number): CoordinateTuple {
  const bdLon = toNumber(lon);
  const bdLat = toNumber(lat);
  const x = bdLon - 0.0065;
  const y = bdLat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}

export function gcj02ToBd09(lon: number, lat: number): CoordinateTuple {
  const gcjLon = toNumber(lon);
  const gcjLat = toNumber(lat);
  const z = Math.sqrt(gcjLon * gcjLon + gcjLat * gcjLat) + 0.00002 * Math.sin(gcjLat * X_PI);
  const theta = Math.atan2(gcjLat, gcjLon) + 0.000003 * Math.cos(gcjLon * X_PI);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

export function wgs84ToGcj02(lon: number, lat: number): CoordinateTuple {
  const wgsLon = toNumber(lon);
  const wgsLat = toNumber(lat);
  if (isOutOfChina(wgsLon, wgsLat)) {
    return [wgsLon, wgsLat];
  }

  const [dLon, dLat] = delta(wgsLon, wgsLat);
  return [wgsLon + dLon, wgsLat + dLat];
}

export function gcj02ToWgs84(lon: number, lat: number): CoordinateTuple {
  const gcjLon = toNumber(lon);
  const gcjLat = toNumber(lat);
  if (isOutOfChina(gcjLon, gcjLat)) {
    return [gcjLon, gcjLat];
  }

  const [dLon, dLat] = delta(gcjLon, gcjLat);
  return [gcjLon - dLon, gcjLat - dLat];
}
