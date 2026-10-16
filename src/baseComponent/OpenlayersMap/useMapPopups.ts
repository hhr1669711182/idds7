import { ref, computed } from 'vue'
import type { CarItem } from '@/composables/useCarFeatures'
import type { JRAlarmData } from '../amap/mapData.ts'
import dayjs from 'dayjs'
import type { IncidentDetailData } from './IncidentDetailDialog.vue'

export type AlarmDetailRow = {
  label: string
  value?: string | number | null
  visible?: boolean
}

const joinText = (...values: Array<string | number | null | undefined>) =>
  values.filter((value) => value !== null && value !== undefined && value !== '').join('')

const hasText = (value: string | number | null | undefined) => value !== null && value !== undefined && value !== ''

const formatCoordinateText = (lng?: string | number | null, lat?: string | number | null) => {
  if (!hasText(lng) && !hasText(lat)) return ''
  if (!hasText(lng)) return String(lat)
  if (!hasText(lat)) return String(lng)
  return `${lng}, ${lat}`
}

const CAR_TYPE_LABELS: Record<CarItem['carType'], string> = {
  fireEngine: '消防车',
  rescue: '救援车',
  ladder: '云梯车',
  command: '指挥车',
}

const CAR_STATUS_LABELS: Record<NonNullable<CarItem['status']>, string> = {
  online: '在线',
  offline: '离线',
  maintenance: '维修中',
}

export const carTypeLabel = (t?: CarItem['carType']) => (t ? (CAR_TYPE_LABELS[t] ?? t) : '')
export const carStatusLabel = (s?: CarItem['status']) => (s ? (CAR_STATUS_LABELS[s] ?? s) : '')

/**
 * 地图业务点位统一弹窗字段：警情规划/今日灾情/警情定位三类点位
 * 归一化到同一组字段，保证弹窗行内容与顺序完全一致；数据源缺字段时留空，
 * 由 AlarmDetailPopup 统一渲染为 "-"。
 */
export type UnifiedAlarmPopupFields = {
  /** 警情类型 */
  disasterTypeLabel?: string | null
  /** 报警时间（任意可被 dayjs 解析的值），无值时留空显示 "-" */
  createdAt?: string | number | Date | null
  /** 燃烧物 */
  burningMaterial?: string | null
  /** 重点单位 */
  keyUnit?: string | null
  /** 警情事件状态 */
  incidentStateName?: string | null
  /** 事发地址 */
  disasterAddress?: string | null
  /** 主管队站（调用方负责完成"名称回退 ID"） */
  mOrgIdLabel?: string | null
}

/**
 * 业务点位弹窗明细行（字段口径唯一来源）。
 * map.vue（useMapPopups）与 dispatchMap.vue 的三类点位共用，保证行内容一致。
 */
export const buildUnifiedAlarmPopupRows = (fields?: UnifiedAlarmPopupFields | null): AlarmDetailRow[] => [
  { label: '警情类型', value: fields?.disasterTypeLabel ?? null },
  {
    label: '报警时间',
    // 无时间不可 dayjs("")（会得到当前时间），直接留空由组件渲染 "-"
    value: fields?.createdAt ? dayjs(fields.createdAt).format('YYYY-MM-DD HH:mm:ss') : null,
  },
  { label: '燃烧物质', value: fields?.burningMaterial ?? null },
  { label: '重点单位', value: fields?.keyUnit ?? null },
  // { label: "警情等级" }：统一口径暂不展示
  { label: '警情事件状态', value: fields?.incidentStateName ?? null },
  { label: '事发地址', value: fields?.disasterAddress ?? null },
  // { label: "警情编号" }：统一口径暂不展示
  { label: '主管队站', value: fields?.mOrgIdLabel ?? null },
]

/** 统一弹窗标题：警情类型 → 事发地址 → 默认文案 */
export const buildUnifiedAlarmPopupTitle = (fields?: UnifiedAlarmPopupFields | null): string =>
  fields?.disasterTypeLabel || fields?.disasterAddress || '警情详情'

/** 今日灾情（JRAlarmData）归一化到统一弹窗字段 */
export const toJrAlarmPopupFields = (data?: JRAlarmData | null): UnifiedAlarmPopupFields => ({
  disasterTypeLabel: data?.disasterTypeLabel,
  createdAt: data?.createdAt,
  burningMaterial: data?.burningMaterial,
  keyUnit: data?.keyUnit,
  incidentStateName: data?.incidentStateName,
  disasterAddress: data?.disasterAddress,
  mOrgIdLabel: data?.mOrgIdLabel ?? data?.mOrgId,
})

/**
 * 警情规划点位数据（字段较松散的业务对象）归一化到统一弹窗字段。
 * 兼容历史字段名：alarmTime→报警时间、status→事件状态、alarmType/type→警情类型。
 */
export const toAlarmPlanPopupFields = (data?: Record<string, any> | null): UnifiedAlarmPopupFields => ({
  disasterTypeLabel: data?.alarmType ?? data?.type ?? data?.disasterTypeLabel,
  createdAt: data?.alarmTime ?? data?.createdAt,
  burningMaterial: data?.burningMaterial,
  keyUnit: data?.keyUnit,
  incidentStateName: data?.status ?? data?.incidentStateName,
  disasterAddress: data?.address ?? data?.disasterAddress,
  mOrgIdLabel: data?.mOrgIdLabel ?? data?.mOrgId,
})

/** 今日灾情弹窗明细行（保留原导出名，内部走统一口径） */
export const buildJrAlarmPopupRows = (data?: JRAlarmData | null): AlarmDetailRow[] =>
  buildUnifiedAlarmPopupRows(toJrAlarmPopupFields(data))

export function useMapPopups() {
  // === 队站 (Fire Station) Popup ===
  const firePopupRef = ref<HTMLElement | null>(null)
  const firePopupVisible = ref(false)
  const fireSelected = ref<any | null>(null)

  const closeFirePopup = () => {
    firePopupVisible.value = false
    fireSelected.value = null
  }

  // === 在线车辆 (Car) Popup ===
  const carPopupRef = ref<HTMLElement | null>(null)
  const carPopupVisible = ref(false)
  const carSelected = ref<CarItem | null>(null)

  const closeCarPopup = () => {
    carPopupVisible.value = false
    carSelected.value = null
  }

  // === 警情规划 (Alarm) Popup ===
  const alarmPopupRef = ref<HTMLElement | null>(null)
  const alarmPopupVisible = ref(false)
  const alarmData = ref<any>(null)

  const alarmPopupTitle = computed(() => alarmData.value?.aoi || alarmData.value?.address || '警情详情')
  const alarmPopupRows = computed<AlarmDetailRow[]>(() => {
    const data = alarmData.value
    return [
      { label: '地址', value: data?.address },
      { label: '状态', value: data?.status },
      { label: '时间', value: data?.alarmTime },
      { label: '类型', value: data?.alarmType },
      { label: '燃烧物质', value: data?.burningMaterial },
      { label: '重点单位', value: data?.keyUnit },
      { label: '辖区', value: joinText(data?.district, data?.street) },
      { label: '坐标', value: formatCoordinateText(data?.lng, data?.lat) },
      { label: '详情', value: data?.description },
    ]
  })

  const closeAlarmPopup = () => {
    alarmPopupVisible.value = false
    alarmData.value = null
  }

  // === 今日灾情 (JRAlarm) Popup ===
  const jrAlarmPopupRef = ref<HTMLElement | null>(null)
  const jrAlarmPopupVisible = ref(false)
  const jrAlarmData = ref<JRAlarmData | null>(null)

  const jrAlarmPopupTitle = computed(() => {
    const data = jrAlarmData.value
    const left = data?.disasterTypeLabel ?? '警情'
    const right = data?.disasterGradeLabel ?? data?.disasterGrade ?? ''
    return right ? `${left} - ${right}` : left
  })

  const jrAlarmPopupRows = computed<AlarmDetailRow[]>(() => buildJrAlarmPopupRows(jrAlarmData.value))

  const closeJRAlarmPopup = () => {
    jrAlarmPopupVisible.value = false
    jrAlarmData.value = null
  }

  // === 警情详情固定弹窗（居中 Modal，小弹窗点"警情详情"打开） ===
  const incidentDetailVisible = ref(false)
  const incidentDetailData = ref<IncidentDetailData | null>(null)

  /** 从松散业务对象中按候选字段名取第一个非空值 */
  const pickField = (data: Record<string, any> | null | undefined, keys: string[]): string | null => {
    for (const key of keys) {
      const value = data?.[key]
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        return String(value)
      }
    }
    return null
  }

  /** 时间值格式化为 YYYY-MM-DD HH:mm:ss，空值/非法值返回 null */
  const formatDetailTime = (value: unknown): string | null => {
    if (value === null || value === undefined || value === '') return null
    const text = dayjs(value as string | number | Date)
    return text.isValid() ? text.format('YYYY-MM-DD HH:mm:ss') : null
  }

  /** 从今日灾情/未结案警情数据构建详情字段 */
  const buildDetailFromJrAlarm = (d: JRAlarmData): IncidentDetailData => ({
    alarmOrderNo: d.incidentId || null,
    receiveTime: formatDetailTime(d.createdAt),
    disasterGrade: d.disasterGradeLabel ?? d.disasterGrade ?? null,
    keyUnitName: d.keyUnit ?? null,
    disasterAddress: d.disasterAddress ?? null,
    burningMaterial: d.burningMaterial ?? null,
    disasterType: d.disasterTypeLabel ?? d.disasterType ?? null,
  })

  /** 从警情规划数据构建详情字段 */
  const buildDetailFromAlarm = (d: Record<string, any> | null): IncidentDetailData => ({
    alarmOrderNo: pickField(d, ['alarmOrderNo', 'orderNo', 'incidentId', 'inquiryId']),
    callInTime: formatDetailTime(pickField(d, ['callInTime', 'callTime', 'alarmTime'])),
    accessType: pickField(d, ['accessType', 'accessTypeLabel']),
    callerPhone: pickField(d, ['callerPhone', 'callerNumber', 'phone']),
    callerName: pickField(d, ['callerName', 'ownerName']),
    installAddress: pickField(d, ['installAddress', 'installedAddress']),
    seatNo: pickField(d, ['seatNo', 'seatId']),
    receiveTime: formatDetailTime(pickField(d, ['receiveTime', 'createdAt'])),
    disasterGrade: pickField(d, ['disasterGradeLabel', 'disasterGrade']),
    keyUnitName: pickField(d, ['keyUnitName', 'keyUnit']),
    supplementary: pickField(d, ['supplementary', 'isSupplementary']),
    disasterAddress: pickField(d, ['disasterAddress', 'address']),
    burningMaterial: pickField(d, ['burningMaterial']),
    alarmFlag: pickField(d, ['alarmFlag', 'alarmFlagLabel']),
    smokeSituation: pickField(d, ['smokeSituation', 'smoke']),
    trappedCount: pickField(d, ['trappedCount', 'trappedPeopleCount']),
    administrativeDivision: pickField(d, ['administrativeDivision', 'district']),
    disasterType: pickField(d, ['disasterTypeLabel', 'disasterType', 'alarmType']),
  })

  /** 点击小弹窗"警情详情"按钮：快照当前点位数据并打开固定弹窗 */
  const openIncidentDetailFromAlarm = () => {
    if (!alarmData.value) return
    incidentDetailData.value = buildDetailFromAlarm(alarmData.value)
    incidentDetailVisible.value = true
  }

  const openIncidentDetailFromJrAlarm = () => {
    if (!jrAlarmData.value) return
    incidentDetailData.value = buildDetailFromJrAlarm(jrAlarmData.value)
    incidentDetailVisible.value = true
  }

  return {
    formatCoordinateText,
    firePopupRef,
    firePopupVisible,
    fireSelected,
    closeFirePopup,
    carPopupRef,
    carPopupVisible,
    carSelected,
    closeCarPopup,
    alarmPopupRef,
    alarmPopupVisible,
    alarmData,
    alarmPopupTitle,
    alarmPopupRows,
    closeAlarmPopup,
    jrAlarmPopupRef,
    jrAlarmPopupVisible,
    jrAlarmData,
    jrAlarmPopupTitle,
    jrAlarmPopupRows,
    closeJRAlarmPopup,
    incidentDetailVisible,
    incidentDetailData,
    openIncidentDetailFromAlarm,
    openIncidentDetailFromJrAlarm,
  }
}
