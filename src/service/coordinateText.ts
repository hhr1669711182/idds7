/**
 * 经纬度文本识别：把用户在检索框输入的多种坐标写法归一为 WGS84 [lng, lat]。
 *
 * 识别规则（任一命中即认为输入是坐标）：
 * 1. 逗号分隔：    123.2436,34.4364 / 123.2436，34.4364（中英文逗号均可）
 * 2. 空格分隔：    123.2436 34.4364
 * 3. 数组字符串：  "[123.2436,34.4364]"（也兼容 [123.2436, 34.4364]）
 * 4. 对象字符串：  '{"lng":123.2436,"lat":34.4364}'，键名允许标准英文或省略写法
 *
 * 接口入参与出参在本项目内统一 WGS84，本模块只做解析，不做任何坐标转换。
 */

/** 坐标合法范围：经度 [-180,180]，纬度 [-90,90] */
const isValidLngLat = (lng: number, lat: number) =>
  Number.isFinite(lng) &&
  Number.isFinite(lat) &&
  lng >= -180 &&
  lng <= 180 &&
  lat >= -90 &&
  lat <= 90;

const toPair = (a: unknown, b: unknown): [number, number] | null => {
  const lng = Number(a);
  const lat = Number(b);
  return isValidLngLat(lng, lat) ? [lng, lat] : null;
};

/** 从对象中按候选键名取经纬度，兼容 lng/lon/longitude/lat/latitude 及其大小写与省略写法 */
const pickFromObject = (source: Record<string, unknown>): [number, number] | null => {
  const lngKeys = ['lng', 'lon', 'long', 'longitude', 'lnglat_lng', 'x'];
  const latKeys = ['lat', 'latitude', 'lnglat_lat', 'y'];
  const lowerMap = new Map<string, unknown>();
  for (const [key, value] of Object.entries(source)) {
    lowerMap.set(key.toLowerCase().trim(), value);
  }
  let lng: unknown;
  let lat: unknown;
  for (const key of lngKeys) {
    if (lowerMap.has(key)) { lng = lowerMap.get(key); break; }
  }
  for (const key of latKeys) {
    if (lowerMap.has(key)) { lat = lowerMap.get(key); break; }
  }
  // 标准键名命中时直接返回（键名大小写不敏感）
  if (lng !== undefined && lat !== undefined) {
    const pair = toPair(lng, lat);
    if (pair) return pair;
  }

  // 省略写法：坐标被塞进任一键值（字符串键或字符串值），递归按其余规则解析
  for (const value of Object.values(source)) {
    if (typeof value !== 'string') continue;
    const parsed = parseCoordinateText(value);
    if (parsed) return parsed;
  }
  for (const key of Object.keys(source)) {
    const parsed = parseCoordinateText(key);
    if (parsed) return parsed;
  }
  return null;
};

const stripBrackets = (text: string) => text.trim().replace(/^[[({]+/, '').replace(/[\])}]+$/, '');

/**
 * 解析经纬度文本；命中返回 [lng, lat]，未命中返回 null。
 */
export function parseCoordinateText(raw: string): [number, number] | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  // 规则 4：对象字符串（含标准英文键或省略写法）
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const pair = pickFromObject(parsed as Record<string, unknown>);
        if (pair) return pair;
      }
    } catch {
      // 不是合法 JSON，继续按其他规则尝试
    }
  }

  // 规则 3：数组字符串 "[123.2436,34.4364]"
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (Array.isArray(parsed) && parsed.length >= 2) {
        const pair = toPair(parsed[0], parsed[1]);
        if (pair) return pair;
      }
    } catch {
      // 不是合法 JSON，继续按其他规则尝试
    }
  }

  // 规则 1 / 2：中英文逗号或空格分隔
  const body = stripBrackets(text).replace(/^["']|["']$/g, '');
  const byComma = body.split(/[,，]/);
  if (byComma.length >= 2) {
    const pair = toPair(byComma[0], byComma[1]);
    if (pair) return pair;
  }
  const bySpace = body.split(/[\s]+/);
  if (bySpace.length >= 2) {
    const pair = toPair(bySpace[0], bySpace[1]);
    if (pair) return pair;
  }

  return null;
}

/** 是否是经纬度文本（供 UI 决定走逆地址解析分支） */
export const isCoordinateText = (raw: string): boolean => parseCoordinateText(raw) !== null;