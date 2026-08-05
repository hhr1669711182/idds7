import TileLayer from "ol/layer/Tile.js";
import Projection from "ol/proj/Projection.js";
import {
  addCoordinateTransforms,
  addProjection,
  get as getProjection,
} from "ol/proj.js";
import TileGrid from "ol/tilegrid/TileGrid.js";
import XYZ, { type Options as XYZOptions } from "ol/source/XYZ.js";
import { applyTransform, type Extent } from "ol/extent.js";

import {
  bd09ToGcj02,
  gcj02ToBd09,
  gcj02ToWgs84,
  wgs84ToGcj02,
  type CoordinateTuple,
} from "./transform.ts";

export type BaiduMapType = "road" | "image";

export interface BaiduSourceOptions extends Omit<
  XYZOptions,
  "projection" | "tileGrid" | "tileUrlFunction" | "url" | "urls" | "wrapX"
> {
  mapType?: BaiduMapType;
  crossOrigin?: string | null;
  wrapX?: boolean;
}

export interface BaiduLayerOptions extends BaiduSourceOptions {
  className?: string;
}

type TransformFunction = (
  input: number[],
  output?: number[],
  dimension?: number,
) => number[];
type PointTransform = (input: CoordinateTuple) => CoordinateTuple;

const BAIDU_PROJECTION_CODE = "baidu";
const EARTH_RADIUS = 6378137;
const MAX_LATITUDE = 85.0511287798;
const RAD_PER_DEG = Math.PI / 180;
const BAIDU_LON_LAT_EXTENT: Extent = [72.004, 0.8293, 137.8347, 55.8271];
const BAIDU_RESOLUTIONS = Array.from({ length: 19 }, (_, index) =>
  Math.pow(2, 18 - index),
);

const MCBAND = [12890594.86, 8362377.87, 5591021, 3481989.83, 1678043.12, 0];
const LLBAND = [75, 60, 45, 30, 15, 0];

const MC2LL = [
  [
    1.410526172116255e-8, 0.00000898305509648872, -1.9939833816331,
    200.9824383106796, -187.2403703815547, 91.6087516669843, -23.38765649603339,
    2.57121317296198, -0.03801003308653, 17337981.2,
  ],
  [
    -7.435856389565537e-9, 0.000008983055097726239, -0.78625201886289,
    96.32687599759846, -1.85204757529826, -59.36935905485877, 47.40033549296737,
    -16.50741931063887, 2.28786674699375, 10260144.86,
  ],
  [
    -3.030883460898826e-8, 0.00000898305509983578, 0.30071316287616,
    59.74293618442277, 7.357984074871, -25.38371002664745, 13.45380521110908,
    -3.29883767235584, 0.32710905363475, 6856817.37,
  ],
  [
    -1.981981304930552e-8, 0.000008983055099779535, 0.03278182852591,
    40.31678527705744, 0.65659298677277, -4.44255534477492, 0.85341911805263,
    0.12923347998204, -0.04625736007561, 4482777.06,
  ],
  [
    3.09191371068437e-9, 0.000008983055096812155, 0.00006995724062,
    23.10934304144901, -0.00023663490511, -0.6321817810242, -0.00663494467273,
    0.03430082397953, -0.00466043876332, 2555164.4,
  ],
  [
    2.890871144776878e-9, 0.000008983055095805407, -3.068298e-8,
    7.47137025468032, -0.00000353937994, -0.02145144861037, -0.00001234426596,
    0.00010322952773, -0.00000323890364, 826088.5,
  ],
] as const;

const LL2MC = [
  [
    -0.0015702102444, 111320.7020616939, 1704480524535203, -10338987376042340,
    26112667856603880, -35149669176653700, 26595700718403920,
    -10725012454188240, 1800819912950474, 82.5,
  ],
  [
    0.0008277824516172526, 111320.7020463578, 647795574.6671607,
    -4082003173.641316, 10774905663.51142, -15171875531.51559,
    12053065338.62167, -5124939663.577472, 913311935.9512032, 67.5,
  ],
  [
    0.00337398766765, 111320.7020202162, 4481351.045890365, -23393751.19931662,
    79682215.47186455, -115964993.2797253, 97236711.15602145,
    -43661946.33752821, 8477230.501135234, 52.5,
  ],
  [
    0.00220636496208, 111320.7020209128, 51751.86112841131, 3796837.749470245,
    992013.7397791013, -1221952.21711287, 1340652.697009075, -620943.6990984312,
    144416.9293806241, 37.5,
  ],
  [
    -0.0003441963504368392, 111320.7020576856, 278.2353980772752,
    2485758.690035394, 6070.750963243378, 54821.18345352118, 9540.606633304236,
    -2710.55326746645, 1405.483844121726, 22.5,
  ],
  [
    -0.0003218135878613132, 111320.7020701615, 0.00369383431289,
    823725.6402795718, 0.46104986909093, 2351.343141331292, 1.58060784298199,
    8.77738589078284, 0.37238884252424, 7.45,
  ],
] as const;

let baiduProjection: Projection | null = null;

const forEachPoint =
  (func: PointTransform): TransformFunction =>
  (input, output, dimension = 2) => {
    const result =
      output ?? (dimension === 2 ? new Array(input.length) : input.slice());
    for (let offset = 0; offset < input.length; offset += dimension) {
      const [x, y] = func([input[offset], input[offset + 1]]);
      result[offset] = x;
      result[offset + 1] = y;
      for (let index = 2; index < dimension; index += 1) {
        result[offset + index] = input[offset + index];
      }
    }
    return result;
  };

const getRange = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const getLoop = (value: number, min: number, max: number) => {
  const delta = max - min;
  let result = value;
  while (result > max) result -= delta;
  while (result < min) result += delta;
  return result;
};

const convertor = (
  [px, py]: CoordinateTuple,
  table: readonly number[],
): CoordinateTuple => {
  const x = table[0] + table[1] * Math.abs(px);
  const d = Math.abs(py) / table[9];
  const y =
    table[2] +
    table[3] * d +
    table[4] * d * d +
    table[5] * d * d * d +
    table[6] * d * d * d * d +
    table[7] * d * d * d * d * d +
    table[8] * d * d * d * d * d * d;

  return [x * (px < 0 ? -1 : 1), y * (py < 0 ? -1 : 1)];
};

const findLonLatTable = (lat: number) => {
  for (let index = 0; index < LLBAND.length; index += 1) {
    if (lat >= LLBAND[index]) return LL2MC[index];
  }
  for (let index = LLBAND.length - 1; index >= 0; index -= 1) {
    if (lat <= -LLBAND[index]) return LL2MC[index];
  }
  return LL2MC[LL2MC.length - 1];
};

const findMercatorTable = (y: number) => {
  const absY = Math.abs(y);
  for (let index = 0; index < MCBAND.length; index += 1) {
    if (absY >= MCBAND[index]) return MC2LL[index];
  }
  return MC2LL[MC2LL.length - 1];
};

const sphericalMercatorForward = ([
  lon,
  lat,
]: CoordinateTuple): CoordinateTuple => {
  const clampedLat = getRange(lat, -MAX_LATITUDE, MAX_LATITUDE);
  const sin = Math.sin(clampedLat * RAD_PER_DEG);
  return [
    EARTH_RADIUS * lon * RAD_PER_DEG,
    (EARTH_RADIUS * Math.log((1 + sin) / (1 - sin))) / 2,
  ];
};

const sphericalMercatorInverse = ([x, y]: CoordinateTuple): CoordinateTuple => [
  x / EARTH_RADIUS / RAD_PER_DEG,
  (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) / RAD_PER_DEG,
];

const bd09ToWgs84 = ([lon, lat]: CoordinateTuple): CoordinateTuple => {
  const [gcjLon, gcjLat] = bd09ToGcj02(lon, lat);
  return gcj02ToWgs84(gcjLon, gcjLat);
};

const bd09FromWgs84 = ([lon, lat]: CoordinateTuple): CoordinateTuple => {
  const [gcjLon, gcjLat] = wgs84ToGcj02(lon, lat);
  return gcj02ToBd09(gcjLon, gcjLat);
};

const baiduMercatorForwardPoint = ([
  lon,
  lat,
]: CoordinateTuple): CoordinateTuple => {
  const normalizedLon = getLoop(lon, -180, 180);
  const normalizedLat = getRange(lat, -74, 74);
  return convertor(
    [normalizedLon, normalizedLat],
    findLonLatTable(normalizedLat),
  );
};

const baiduMercatorInversePoint = (
  coordinate: CoordinateTuple,
): CoordinateTuple => convertor(coordinate, findMercatorTable(coordinate[1]));

const lonLatToBaiduMercator = forEachPoint((coordinate) =>
  baiduMercatorForwardPoint(bd09FromWgs84(coordinate)),
);

const baiduMercatorToLonLat = forEachPoint((coordinate) =>
  bd09ToWgs84(baiduMercatorInversePoint(coordinate)),
);

const sphericalMercatorToBaiduMercator = forEachPoint((coordinate) =>
  baiduMercatorForwardPoint(
    bd09FromWgs84(sphericalMercatorInverse(coordinate)),
  ),
);

const baiduMercatorToSphericalMercator = forEachPoint((coordinate) =>
  sphericalMercatorForward(bd09ToWgs84(baiduMercatorInversePoint(coordinate))),
);

const BAIDU_PROJECTION_EXTENT = applyTransform(
  BAIDU_LON_LAT_EXTENT,
  lonLatToBaiduMercator,
) as Extent;

const createBaiduTileGrid = () =>
  new TileGrid({
    extent: BAIDU_PROJECTION_EXTENT,
    origin: [0, 0],
    resolutions: BAIDU_RESOLUTIONS,
    tileSize: [256, 256],
  });

export function registerBaiduProjection(): Projection {
  const existing = getProjection(BAIDU_PROJECTION_CODE);
  if (existing) return existing;

  if (!baiduProjection) {
    baiduProjection = new Projection({
      code: BAIDU_PROJECTION_CODE,
      extent: BAIDU_PROJECTION_EXTENT,
      units: "m",
    });

    addProjection(baiduProjection);
    addCoordinateTransforms(
      "EPSG:4326",
      baiduProjection,
      lonLatToBaiduMercator,
      baiduMercatorToLonLat,
    );
    addCoordinateTransforms(
      "EPSG:3857",
      baiduProjection,
      sphericalMercatorToBaiduMercator,
      baiduMercatorToSphericalMercator,
    );
  }

  return baiduProjection;
}

const s = Math.floor(Math.random() * 4);
const ak = "fUU6P4T1HJ04PB9zy6xUguQoWMoZ4ng6";
const createTileUrlFunction = (mapType: BaiduMapType, tileCoord: number[]) => {
  const x = tileCoord[1];
  const y = -tileCoord[2] - 1;
  const z = tileCoord[0];

  if (mapType === "image") {
    return `http://shangetu${s}.map.bdimg.com/it/u=x=${x};y=${y};z=${z};v=009;type=sate&fm=46&udt=20170606&ak=${ak}`;
  }

  return `http://online${s}.map.bdimg.com/tile/?qt=vtile&x=${x}&y=${y}&z=${z}&styles=pl&udt=udt=20170908&scaler=1&p=1&ak=${ak}`;
};

export function createBaiduSource(options: BaiduSourceOptions = {}) {
  const {
    mapType = "road",
    crossOrigin = "anonymous",
    wrapX = true,
    ...sourceOptions
  } = options;

  return new XYZ({
    ...sourceOptions,
    projection: registerBaiduProjection(),
    maxZoom: sourceOptions.maxZoom ?? 18,
    tileGrid: createBaiduTileGrid(),
    crossOrigin,
    wrapX,
    tileUrlFunction: (t: number[]) => createTileUrlFunction(mapType, t),
  });
}

export function createBaiduLayer(
  options: BaiduLayerOptions = {},
): TileLayer<XYZ> {
  const { className, ...sourceOptions } = options;
  return new TileLayer({
    className,
    source: createBaiduSource(sourceOptions),
  });
}
