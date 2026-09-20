import { alovaInstance } from '../alova';
import { AppError } from '../error';
import { normalizeDispatchVehicles, type RawIncidentVehiclePage } from '../../Control/dispatchVehicleAdapter';

/** Dispatch1 专用接口，不使用旧调派接口及其 Mock。 */
export interface DispatchVehicleDTO {
  /** 主管队站/辖区组织 ID（车辆归属队站）。 */
  leadStationId: string;
  /** 车牌号，仅用于展示与按车牌查询，不能当调派主键。 */
  plateNumber: string;
  /** 车辆名称，无值时为 null。 */
  vehicleName: string | null;
  /** 车辆状态（原始状态码/文案），无值时为 null。 */
  vehicleStatus: string | null;
  /** 车辆类型（类型码），无值时为 null。 */
  vehicleType: string | null;
  /** 车辆主键，供调派使用；车牌不能当调派主键。 */
  vehicleId?: string | null;
  /** 旧契约字段；适配层用 orgName 回填，供未迁移的调用方使用。 */
  organization?: string | null;
  /** 所属组织 ID，无值时为 null。 */
  orgId?: string | null;
  /** 所属组织名称，无值时为 null。 */
  orgName?: string | null;
  /** 旧契约字段（米）；适配层由 vehicleHeightCm / 100 回填。 */
  vehicleHeightMeters?: number | null;
  /** 车辆高度（cm）。 */
  vehicleHeightCm?: number | null;
  /** 旧契约字段（秒）；适配层由 eta 回填（本期 eta 恒为 null）。 */
  etaSeconds?: number | null;
  /** 预估到达时间，本期恒为 null。 */
  eta?: number | null;
  /** 是否主管队站车辆。 */
  primaryStation?: boolean;
  /** 30 分钟内是否归队。 */
  returnedWithin30Min?: boolean;
  /** 距警情距离（公里），无值时为 null。 */
  distanceKm?: number | null;
}

/** confirm 请求中的单台车辆；stationId 可选，传了后端也不据此出站。 */
export interface DispatchConfirmVehicle {
  vehicleId: string;
  stationId?: string;
}

export interface DispatchVehiclesRequest {
  /** 路径参数：警情 ID，不放进 body。 */
  incidentId: string;
  /** 前端生成的幂等键（UUID）；同一业务操作重试必须保持不变。 */
  commandId: string;
  /** 当前调派编队 ID；等于当前 manualPlanId 时后端判定 MANUAL，否则 CANDIDATE。 */
  formationId: string;
  /** 调派编队版本，必须为 >= 0 的整数。 */
  formationVersion: number;
  /** 本次确认调派的车辆，非空且 <= 200，vehicleId 不可重复。 */
  vehicles: DispatchConfirmVehicle[];
}

/** 调派批次内的队站汇总。 */
export interface DispatchBatchStation {
  stationId: string;
  stationName: string;
  vehicleCount: number;
  vehicleTypeCodes: string[];
}

/** 后端权威确认的调派批次。 */
export interface DispatchBatch {
  batchId: string;
  kind: string;
  seq: number;
  dispatchedAt: string;
  vehicleCount: number;
  stations: DispatchBatchStation[];
}

/** POST /dispatch/incidents/{incidentId}/confirm 成功响应。 */
export interface DispatchConfirmResult {
  commandId: string;
  incidentId: string;
  batch: DispatchBatch;
}

export function validateDispatchRequest(data: DispatchVehiclesRequest): void {
  if (!data.incidentId?.trim()) throw new Error('无法调派：缺少 incidentId（警情 ID）');
  if (!data.commandId?.trim()) throw new Error('无法调派：缺少 commandId（幂等键）');
  if (!data.formationId?.trim()) {
    throw new Error('无法调派：缺少 formationId（当前调派编队），请先取得真实调派编队');
  }
  if (!Number.isInteger(data.formationVersion) || data.formationVersion < 0) {
    throw new Error('无法调派：formationVersion 必须为 >= 0 的整数');
  }
  const vehicleIds = (data.vehicles ?? []).map(vehicle => vehicle?.vehicleId?.trim() ?? '');
  if (!vehicleIds.length || vehicleIds.length > 200
    || vehicleIds.some(vehicleId => !vehicleId)
    || new Set(vehicleIds).size !== vehicleIds.length) {
    throw new Error('请选择 1—200 个具有有效且不重复 vehicleId 的车辆');
  }
}

/** 生成调派命令幂等键（UUID v4）。同一业务操作重试必须复用同一个 commandId。 */
export function createCommandId(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10, 16).join(''),
    ].join('-');
  }
  // 仅在极端老旧环境（无 Web Crypto）下兜底；时间戳前缀保证同机多次生成不重复。
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 调派域实时数据：禁用 Alova 缓存；错误由调派面板自行展示，不弹全局 ElMessage。 */
const dispatchMethodConfig = { cacheFor: 0, meta: { showError: false } };

/** 50140/40440 的前端中文提示；其余业务码原样透传（AppError 已携带后端 message）。 */
const BIZ_MESSAGE: Record<number, string> = {
  50140: '50140：车辆接口协议尚未开放（GIS_VEHICLE_CONTRACT_PENDING）',
  40440: '40440：警情不可见或主管队站不匹配，请核对警情和主管队站',
};
const rethrowWithBizMessage = (error: unknown): never => {
  const message = error instanceof AppError ? BIZ_MESSAGE[error.bizCode ?? -1] : undefined;
  throw message ? new Error(message) : error;
};

/**
 * 获取指定警情下的车辆列表。
 * GET /bff-client/api/v1/gis/incidents/{incidentId}/vehicles，data 为 {list,...} 分页壳。
 * @param incidentId 警情 ID（路径参数，必填）。
 * @param leadStationId 主管队站 ID，用于适配层回填车辆归属，不上送到接口。
 * @returns 经适配层归一化后的当前页车辆列表。
 */
export async function listDispatchVehicles(incidentId: string, leadStationId: string): Promise<DispatchVehicleDTO[]> {
  if (!incidentId?.trim()) throw new Error('缺少警情 ID');
  if (!leadStationId?.trim()) throw new Error('缺少主管队站 ID');
  const page = await alovaInstance.Get<RawIncidentVehiclePage>(
    `/bff-client/api/v1/gis/incidents/${incidentId}/vehicles`,
    dispatchMethodConfig,
  ).catch(rethrowWithBizMessage);
  return normalizeDispatchVehicles(page, leadStationId);
}

/**
 * 调派车辆。
 * @param data 调派请求数据。
 * @returns 调派结果。
 */
export async function dispatchVehiclesBatch(data: DispatchVehiclesRequest): Promise<DispatchConfirmResult> {
  validateDispatchRequest(data);
  // incidentId 只走路径，body 只保留 confirm 契约字段（planId 即使后端支持也不传）。
  const { incidentId, commandId, formationId, formationVersion, vehicles } = data;
  const result = await alovaInstance.Post<DispatchConfirmResult>(
    `/bff-client/api/v1/dispatch/incidents/${incidentId}/confirm`,
    { commandId, formationId, formationVersion, vehicles },
    dispatchMethodConfig,
  ).catch(rethrowWithBizMessage);
  // 原子批量调派：回声 commandId/incidentId 必须一致，批次必须存在且车辆数与请求一致，拒绝部分成功。
  if (!result?.batch
    || result.incidentId !== incidentId
    || result.commandId !== commandId
    || !result.batch.batchId?.trim()
    || result.batch.vehicleCount !== vehicles.length) {
    throw new Error('调派响应未确认当前命令成功，请查询批次状态后再操作，勿直接重复提交');
  }
  return result;
}

/** GET /dispatch/incidents/{incidentId}/formation 返回的原始数据结构。 */
export interface DispatchFormationResponse {
  incidentId: string;
  formation: {
    formationId: string;
    /** 后端可能不返回，缺省时前端按 1 处理 */
    formationVersion?: number;
  };
}

/** 调派编队信息（已归一化）。 */
export interface DispatchFormation {
  /** 当前调派编队 ID；等于 manualPlanId 时后端判定 MANUAL，否则 CANDIDATE。 */
  formationId: string;
  /** 调派编队版本；后端返回则用返回值，缺省为前端固定值 1。 */
  formationVersion: number;
}

/** 前端固定的调派编队版本兜底；后端不返回 formationVersion 时使用。 */
export const DISPATCH_FORMATION_VERSION = 1;

/**
 * 获取指定警情当前的调派编队。
 * 调派前必须先拿到权威 formationId，不能用前端或 WS 画像的占位值。
 * @param incidentId 警情 ID。
 * @returns 归一化后的调派编队信息。
 */
export async function queryDispatchFormation(incidentId: string): Promise<DispatchFormation> {
  if (!incidentId?.trim()) throw new Error('缺少警情 ID，无法查询调派编队');
  const result = await alovaInstance.Get<DispatchFormationResponse>(
    `/bff-client/api/v1/dispatch/incidents/${incidentId}/formation`,
    dispatchMethodConfig,
  ).catch(rethrowWithBizMessage);
  const formationId = result?.formation?.formationId;
  if (!formationId?.trim()) {
    throw new Error('调派编队响应缺少 formationId，请先取得真实调派编队');
  }
  const rawFormationVersion = result?.formation?.formationVersion;
  const formationVersion = typeof rawFormationVersion === 'number'
    && Number.isFinite(rawFormationVersion)
    && rawFormationVersion >= 0
    ? rawFormationVersion
    : DISPATCH_FORMATION_VERSION;
  return { formationId, formationVersion };
}
