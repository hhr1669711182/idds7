import type { DispatchVehicleDTO } from '@/service/methods/dispatchVehicles';

/**
 * GET /gis/incidents/{incidentId}/vehicles 后端原始车辆投影。
 * 仅在本适配层出现，不允许泄漏到调用方/页面逻辑。
 */
export interface RawIncidentVehicle {
  vehicleId: string | null;
  plateNumber: string;
  vehicleName: string | null;
  vehicleType: string | null;
  vehicleStatus: string | null;
  orgId: string | null;
  orgName: string | null;
  /** 是否主管队站车辆。 */
  primaryStation: boolean;
  /** 30 分钟内是否归队。 */
  returnedWithin30Min: boolean;
  /** 距警情距离（公里），无值时为 null。 */
  distanceKm: number | null;
  /** 文档约定本期恒为 null；若临时返回非数值，按 unknown 接收并在适配层收敛。 */
  eta: unknown;
}

/** GET /gis/incidents/{incidentId}/vehicles 返回的分页壳（data）。 */
export interface RawIncidentVehiclePage {
  /** 数据快照时间戳（毫秒）。 */
  asOf: number;
  /** 符合条件的车辆总数；分页时可能大于当前页 list 长度，不能据此校验条数。 */
  total: number;
  /** 当前页码，从 1 开始。 */
  page: number;
  /** 每页条数。 */
  size: number;
  /** list 是否已按距离排序。 */
  sortedByDistance: boolean;
  /** 当前页车辆投影。 */
  list: RawIncidentVehicle[];
  /** 后端声明本页数据中缺口/不可靠的字段名（如 orgName、eta）。 */
  sourceGaps?: string[];
}

/**
 * 车辆接口数据拦截/适配层：把后端原始车辆投影校验并归一化为内部稳定的 DispatchVehicleDTO。
 * 后端再调整字段（重命名、单位变更、增删字段、eta 临时返回对象等）时只改本文件，
 * service 调用方、Store 与页面逻辑均无需改动。
 * @param page GET /gis/incidents/{incidentId}/vehicles 返回的分页壳 data。
 * @param leadStationId 请求时使用的主管队站 ID，用于回填响应中缺失的归属字段。
 * @returns 归一化后的当前页车辆列表。
 */
export function normalizeDispatchVehicles(
  page: RawIncidentVehiclePage,
  leadStationId: string,
): DispatchVehicleDTO[] {
  const list = page && typeof page === 'object' && Array.isArray(page.list) ? page.list : null;
  if (!list) {
    // 结构不符时把实际形态带进错误信息，便于一次定位（之前只报“响应无效”无法判断原因）。
    const shape = page === null ? 'null'
      : Array.isArray(page) ? 'array'
        : page && typeof page === 'object' ? `object{${Object.keys(page).join(',')}}`
          : typeof page;
    throw new Error(`车辆列表响应结构无效：期望 {list} 分页壳，实际为 ${shape}`);
  }
  const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  const reasons: string[] = [];
  const vehicles = list.map((raw, index) => {
    // plateNumber 是渲染与去重主键，属于关键契约，缺失必须明确报错。
    if (!raw || typeof raw.plateNumber !== 'string' || !raw.plateNumber.trim()) {
      reasons.push(`#${index} 缺少有效 plateNumber`);
    }
    // vehicleId 是调派主键：类型必须是 string|null，异常类型不能静默吞掉。
    if (raw && raw.vehicleId !== null && typeof raw.vehicleId !== 'undefined'
      && typeof raw.vehicleId !== 'string') {
      reasons.push(`#${index} vehicleId 不是字符串（${typeof raw.vehicleId}）`);
    }
    if (!raw) return null;
    const warn = (field: string) => console.warn(
      `[dispatchVehicleAdapter] 车辆 #${index}(${raw.plateNumber}) 的 ${field} 字段类型不符，已按缺省值降级`,
    );
    // 以下均为展示类字段：后端漏返/类型漂移时安全降级，不拖垮整个列表。
    if (raw.primaryStation != null && typeof raw.primaryStation !== 'boolean') warn('primaryStation');
    if (raw.returnedWithin30Min != null && typeof raw.returnedWithin30Min !== 'boolean') {
      warn('returnedWithin30Min');
    }
    if (raw.distanceKm != null && (typeof raw.distanceKm !== 'number'
      || !Number.isFinite(raw.distanceKm) || raw.distanceKm < 0)) {
      warn('distanceKm');
    }
    // eta 文档约定恒为 null；非有限数字统一收敛为 null。
    const eta = typeof raw.eta === 'number' && Number.isFinite(raw.eta) && raw.eta >= 0
      ? raw.eta
      : null;
    const orgName = typeof raw.orgName === 'string' || raw.orgName === null ? raw.orgName : null;
    const distanceKm = typeof raw.distanceKm === 'number'
      && Number.isFinite(raw.distanceKm) && raw.distanceKm >= 0
      ? raw.distanceKm
      : null;
    return {
      // 响应不回 leadStationId，用请求入参回填，保证内部 DTO 归属字段稳定。
      leadStationId,
      plateNumber: raw.plateNumber,
      vehicleName: text(raw.vehicleName),
      vehicleStatus: text(raw.vehicleStatus),
      vehicleType: text(raw.vehicleType),
      vehicleId: text(raw.vehicleId),
      orgId: text(raw.orgId),
      orgName,
      // 回填旧契约字段，保证未迁移的调用方逻辑不变。
      organization: orgName,
      // 本契约不再返回车辆高度，统一置空；页面高度展示走“暂无”分支。
      vehicleHeightCm: null,
      vehicleHeightMeters: null,
      eta,
      etaSeconds: eta,
      primaryStation: raw.primaryStation === true,
      returnedWithin30Min: raw.returnedWithin30Min === true,
      distanceKm,
    } satisfies DispatchVehicleDTO;
  });
  if (reasons.length) throw new Error(`车辆列表响应无效，或警情/主管队站不匹配：${reasons.join('；')}`);
  const validVehicles = vehicles.filter((v): v is DispatchVehicleDTO => v !== null);
  const duplicated = validVehicles
    .map(vehicle => vehicle?.plateNumber)
    .filter((plate, index, plates) => plates.indexOf(plate) !== index);
  if (duplicated.length) {
    throw new Error(`车辆列表响应无效：车牌号重复（${[...new Set(duplicated)].join('、')}）`);
  }
  return validVehicles;
}
