import { Fill, Icon, Stroke, Style, Text } from "ol/style";
import type { JRAlarmStatus } from "./mapData";
import type { AmapTmcStatus } from "./useAmapTools";
import { point } from "@turf/turf";

export const MAP_ICON_SRC = {
  alarm: new URL("./imgs/alarm.png", import.meta.url).toString(),
  jrAlarmActive: new URL("./imgs/即时警情.png", import.meta.url).toString(),
  jrAlarmGray: new URL("./imgs/即时警情-灰.png", import.meta.url).toString(),
  fireEngine: new URL("./imgs/fire-engine.svg", import.meta.url).toString(),
  car: new URL("./imgs/car.png", import.meta.url).toString(),
  point: new URL("./imgs/poi.png", import.meta.url).toString(),
} as const;  // 默认配置

/** mock / 在线车辆图标（GC-03） */
export const CAR_ICON = MAP_ICON_SRC.car;

type IconAnchor = [number, number];
type CachedStyle = Style | Style[];

export type IconStyleOptions = {
  iconSrc: string;
  scale?: number;
  anchor?: IconAnchor;
  rotation?: number;
  rotateWithView?: boolean;
  [key: string]: any;
};

export type StyleKey =
  | "alarm"
  | "boundary"
  | "endpoint"
  | "point"
  | "fireStation"
  | "icon"
  | "jrAlarm"
  | "mask"
  | "tmcLine"
  | "vehicle"
  | "commonAlarm"
  | "fireEngine";

type StyleParamsMap = {
  alarm: Pick<IconStyleOptions, "iconSrc" | "scale">;
  boundary: undefined;
  point: undefined;
  endpoint: { type: "start" | "end" | "alarm" };
  fireStation: {
    iconSrc: string;
    scale?: number;
    deviceGoouts?: number;
    deviceTotal?: number;
  };
  icon: IconStyleOptions;
  jrAlarm: { status: JRAlarmStatus; scale?: number };
  mask: undefined;
  tmcLine: { status: AmapTmcStatus; width?: number };
  vehicle: {
    src: string;
    rotation: number;
    scale?: number;
    countdownText?: string;
    styleId?: string;
  };
  commonAlarm: {
    type: 'fire' | 'rescue' | 'society',
    colorType: 'blue' | 'red' | 'grey' | 'def',
    iconSrc?: string;
    scale?: number;
  },
  fireEngine: any,
};

type StyleBuilder<K extends StyleKey> = (params: StyleParamsMap[K]) => CachedStyle;
type StyleBuilderMap = { [K in StyleKey]: StyleBuilder<K> };

const DEFAULT_ICON_ANCHOR: IconAnchor = [0.5, 1];
const CENTER_ICON_ANCHOR: IconAnchor = [0.5, 0.5];

const JR_ALARM_ICON_BY_STATUS: Record<JRAlarmStatus, string> = {
  接警: MAP_ICON_SRC.jrAlarmActive,
  调派: MAP_ICON_SRC.jrAlarmActive,
  途中: MAP_ICON_SRC.jrAlarmActive,
  处置: MAP_ICON_SRC.jrAlarmActive,
  归队: MAP_ICON_SRC.jrAlarmGray,
};

export const BUFFER_POLYGON_FILL = 'rgba(255, 165, 0, 0.3)';
export const ROUTE_LINE_STROKE = '#409eff';
export const FIRE_STATION_ICON = new URL('./imgs/xfz.png', import.meta.url).toString();

const TMC_STATUS_COLOR: Record<AmapTmcStatus, string> = {
  unknown: "#9CA3AF",
  smooth: "#22C55E",
  slow: "#F59E0B",
  jam: "#EF4444",
  serious_jam: "#7F1D1D",
};

const styleCache = new Map<string, CachedStyle>();

const svgDataUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const createIconStyle = ({
  iconSrc,
  scale = 0.9,
  anchor = DEFAULT_ICON_ANCHOR,
  rotation = 0,
  rotateWithView,
  maxZIndex = 10000,
  ...arg
}: IconStyleOptions) =>
  new Style({
    zIndex: maxZIndex,
    image: new Icon({
      src: iconSrc,
      anchor,
      scale,
      rotation,
      rotateWithView,
      ...arg,
    }),
  });

const createPointSvg = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="10" fill="${color}"/><circle cx="14" cy="14" r="6" fill="white"/></svg>`;

export const createBoundaryStyle = () =>
  new Style({
    stroke: new Stroke({ color: "#2563EB", width: 3 }),
  });

export const createMaskStyle = () =>
  new Style({
    fill: new Fill({ color: "rgba(0,0,0,0.12)" }),
    stroke: new Stroke({ color: "rgba(0,0,0,0)", width: 0 }),
  });

export const createTmcLineStyle = (status: AmapTmcStatus, width = 6) =>
  new Style({
    stroke: new Stroke({
      color: TMC_STATUS_COLOR[status] ?? TMC_STATUS_COLOR.unknown,
      width,
    }),
  });

export const createEndpointStyle = (type: "start" | "end" | "alarm") => {
  if (type === "alarm") {
    return createIconStyle({ iconSrc: MAP_ICON_SRC.alarm });
  }

  return createIconStyle({
    iconSrc: svgDataUrl(createPointSvg(type === "start" ? "#22C55E" : "#EF4444")),
    anchor: CENTER_ICON_ANCHOR,
    scale: 1,
  });
};

export const createVehicleStyle = ({
  src,
  rotation,
  scale = 0.65,
  countdownText = "",
}: {
  src: string;
  rotation: number;
  scale?: number;
  countdownText?: string;
}) =>
  new Style({
    image: new Icon({
      src,
      rotation,
      rotateWithView: true,
      scale,
      anchor: CENTER_ICON_ANCHOR,
    }),
    text: new Text({
      text: countdownText,
      offsetY: -34,
      font: "700 12px sans-serif",
      fill: new Fill({ color: "#FFFFFF" }),
      backgroundFill: new Fill({ color: "rgba(17, 24, 39, 0.86)" }),
      padding: [3, 7, 3, 7],
    }),
  });

const createFireStationUsageSvg = ({
  deviceGoouts = 0,
  deviceTotal = 0,
}: {
  deviceGoouts?: number;
  deviceTotal?: number;
}) => {
  const total = Math.max(0, Math.trunc(Number(deviceTotal) || 0));
  const goouts = Math.min(total, Math.max(0, Math.trunc(Number(deviceGoouts) || 0)));
  const ratio = total > 0 ? Math.min(1, Math.max(0, goouts / total)) : 0;
  const percent = Math.round(ratio * 100);
  const color = percent >= 70 ? "#EF4444" : percent >= 35 ? "#F59E0B" : "#22C55E";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="98" height="28" viewBox="0 0 98 28">
    <rect x="1" y="1" width="96" height="26" rx="6" fill="rgba(15,23,42,0.88)" stroke="rgba(255,255,255,0.7)"/>
    <text x="8" y="14" font-size="11" font-family="Arial, sans-serif" font-weight="700" fill="#fff">${goouts}/${total}</text>
    <text x="90" y="14" text-anchor="end" font-size="11" font-family="Arial, sans-serif" font-weight="700" fill="${color}">${percent}%</text>
    <rect x="8" y="19" width="82" height="4" rx="2" fill="rgba(148,163,184,0.36)"/>
    <rect x="8" y="19" width="${Math.round(82 * ratio)}" height="4" rx="2" fill="${color}"/>
  </svg>`;
};

export const createFireStationStyle = ({
  iconSrc,
  scale = 0.8,
  deviceGoouts,
  deviceTotal,
}: StyleParamsMap["fireStation"]): CachedStyle => {
  const iconStyle = createIconStyle({ iconSrc, scale });

  if (deviceGoouts === undefined && deviceTotal === undefined) {
    return iconStyle;
  }

  return [
    iconStyle,
    createIconStyle({
      iconSrc: svgDataUrl(createFireStationUsageSvg({ deviceGoouts, deviceTotal })),
      anchor: [0.5, 2.05],
      scale: 1,
    }),
  ];
};

export const createJRAlarmStyle = ({
  status,
  scale = 0.9,
}: StyleParamsMap["jrAlarm"]) =>
  createIconStyle({
    iconSrc: JR_ALARM_ICON_BY_STATUS[status],
    scale,
  });

const STYLE_BUILDERS: StyleBuilderMap = {
  alarm: (params) =>
    createIconStyle({
      iconSrc: params.iconSrc,
      scale: params.scale ?? 0.9,
    }),
  boundary: () => createBoundaryStyle(),
  point: () => createIconStyle({ iconSrc: MAP_ICON_SRC.point, scale: 1.2 }),
  endpoint: (params) => createEndpointStyle(params.type),
  fireStation: (params) => createFireStationStyle(params),
  icon: (params) => createIconStyle(params),
  jrAlarm: (params) => createJRAlarmStyle(params),
  mask: () => createMaskStyle(),
  tmcLine: (params) => createTmcLineStyle(params.status, params.width ?? 6),
  vehicle: (params) => createVehicleStyle(params),
  commonAlarm: (params) => {
    const { type, colorType = 'def' } = params;
    let url = `${colorType}-${type}`;
    const iconSrc = new URL(`./imgs/${url}.svg`, import.meta.url).toString()

    return createIconStyle({ iconSrc })
  },
  fireEngine: ({ iconSrc, ...args }) => createIconStyle({ iconSrc: iconSrc ?? MAP_ICON_SRC.fireEngine, ...args }),
};

const getVehicleCacheKey = (params: StyleParamsMap["vehicle"]) =>
  ["vehicle", params.src, params.scale ?? 0.65, params.styleId ?? "default"].join(":");

const getCacheKey = <K extends StyleKey>(key: K, params?: StyleParamsMap[K]) => {
  if (key === "vehicle") {
    return getVehicleCacheKey(params as StyleParamsMap["vehicle"]);
  }

  return params === undefined ? key : `${key}:${JSON.stringify(params)}`;
};

const createCachedStyle = <K extends StyleKey>(key: K, params: StyleParamsMap[K]) =>
  STYLE_BUILDERS[key](params as never);

export const getStyle = <K extends StyleKey>(key: K, params?: StyleParamsMap[K]) => {
  const cacheKey = getCacheKey(key, params);

  if (key === "vehicle") {
    const vehicleParams = params as StyleParamsMap["vehicle"];
    const style =
      (styleCache.get(cacheKey) as Style | undefined) ??
      createVehicleStyle({
        src: vehicleParams.src,
        rotation: 0,
        scale: vehicleParams.scale,
        countdownText: vehicleParams.countdownText,
      });

    styleCache.set(cacheKey, style);
    (style.getImage() as Icon).setRotation(vehicleParams.rotation);
    style.getText()?.setText(vehicleParams.countdownText ?? "");
    return style;
  }

  const cached = styleCache.get(cacheKey);
  if (cached) return cached;

  const style = createCachedStyle(key, params as StyleParamsMap[K]);
  styleCache.set(cacheKey, style);
  return style;
};
