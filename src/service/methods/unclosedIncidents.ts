import { alovaInstance } from '../alova'

/** 地图图层口径；unclosed 是集合范围，不是单条警情类型 */
export type GisIncidentLayerKind = 'unclosed' | 'fire_rescue' | 'social_aid'

/** 未结案列表允许出现的前端状态 code */
export type GisOpenState =
  | 'filed'
  | 'pre_dispatched'
  | 'formal_dispatched'
  | 'departed'
  | 'arrived'
  | 'operation_completed'
  | 'returning'
  | 'returned'

export type GisUnclosedIncident = {
  /** 警情唯一标识，来自生命周期 incidentId */
  incidentId: string
  /**
   * BFF 标准化后的警情类型。后端可能返回完整 code（fire_rescue/emergency_rescue/social_aid）
   * 或简写（fire/rescue/society）；服务端未识别时返回 other 或 null。
   * 401 降级样例使用完整 code 口径。
   */
  incidentType:
    | 'fire_rescue'
    | 'fire'
    | 'emergency_rescue'
    | 'rescue'
    | 'social_aid'
    | 'society'
    | 'other'
    | null
  /** 灾害画像提供的类型展示名；没有正式值时为 null */
  incidentTypeName: string | null
  /** 由生命周期 incidentState 按附录 A 转换，列表不返回未知态 */
  incidentState: GisOpenState
  /** 由 BFF 根据 incidentState 生成，禁止透传后端 incidentStateName */
  incidentStateName: string
  /** 报警时间；当前取生命周期 createdAt 原始字符串，不改时区和格式 */
  alarmTime: string
  /** 警情地址，来自画像 disasterAddress */
  address: string | null
  /** 带队干部联系电话；后端协议未登记，当前固定为 null */
  leadOfficerPhone: string | null
  /** 通讯员联系电话；后端协议未登记，当前固定为 null */
  communicatorPhone: string | null
  /** 燃烧物质；“合同 188”未纳入仓库协议，当前固定为 null */
  burningMaterial: string | null
  /** 重点单位名称；后端协议未登记，当前固定为 null */
  keyUnitName: string | null
  /** 警情等级稳定值，来自画像 disasterGrade；GIS 只读 */
  incidentGrade: string | null
  /** 警情等级展示名，来自画像 disasterGradeLabel */
  incidentGradeName: string | null
  /** 警情经度；BFF 可能返回 number 或 string，0/非有限数/缺失时为 null，不重投影 */
  longitude: number | string | null
  /** 警情纬度；BFF 可能返回 number 或 string，0/非有限数/缺失时为 null，不重投影 */
  latitude: number | string | null
  /** 主管队站 ID，来自画像 mOrgId；用于 orgScope 和车辆查询 */
  leadStationId: string | null
}

export type GisUnclosedIncidentList = {
  /** BFF 完成当前响应组装时的 Unix epoch 毫秒 */
  asOf: number
  /** 当前请求采用的图层口径 */
  kind: GisIncidentLayerKind
  /** 当前响应实际返回条数，与 records.length 一致 */
  total: number
  /** 完成状态过滤、orgScope 过滤和必要截断后的警情 */
  records: GisUnclosedIncident[]
  paging: {
    /** full=全量聚合；lifecycle_slice=生命周期分页切片 */
    mode: 'full' | 'lifecycle_slice'
    /** 生命周期原始页码；该值尚未经过 orgScope 后滤 */
    lifecyclePage?: number
    /** 生命周期原始分页大小；该值不等于授权后条数 */
    lifecycleSize?: number
    /** 生命周期原始总数；不能解释为 orgScope 后的全局总数 */
    lifecycleTotal?: number
    /** 当前响应返回条数，与 records.length 一致 */
    returned: number
  }
  meta: {
    /** 明确 alarmTime 当前固定取自生命周期 createdAt */
    alarmTimeSource: 'createdAt'
    /** 因后端协议缺失而统一置 null 的字段名 */
    sourceGaps: Array<
      | 'leadOfficerPhone'
      | 'communicatorPhone'
      | 'burningMaterial'
      | 'keyUnitName'
    >
    /** 降级、异常数据或防御性过滤的可定位诊断串；不是业务状态 */
    sourceErrors?: string[]
  }
}

export type UnclosedIncidentsQuery = {
  /** 默认 unclosed；fire_rescue、social_aid 当前由后端返回 50140 */
  kind?: GisIncidentLayerKind
  /** page、size 必须同时传或同时不传；size 为 1–100 */
  page?: number
  size?: number
}

/** GET /bff-client/api/v1/gis/unclosed-incidents?kind=unclosed */
export const getUnclosedIncidentsMethod = (params?: UnclosedIncidentsQuery) =>
  alovaInstance.Get<GisUnclosedIncidentList, UnclosedIncidentsQuery>(
    '/bff-client/api/v1/gis/unclosed-incidents',
    {
      params: params ?? { kind: 'unclosed' },
      // 每次重新显示图层都获取最新警情，禁用 Alova 响应缓存。
      cacheFor: 0,
     // meta: { showError: true },
    },
  )
