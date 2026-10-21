<script lang="ts">
/**
 * 警情详情数据契约与处理：接口响应格式（IncidentDetailResponseData）、
 * 弹窗展示格式（IncidentDetailData / DispatchOrderRow）、
 * 接口响应归一化函数（toIncidentDetailData）。
 */
import dayjs from "dayjs";

/** 警情详情-报警信息段 */
export type IncidentDetailAlarmInfo = {
  incidentNo?: string | null;
  callInTime?: string | null;
  accessType?: string | null;
  callerPhone?: string | null;
  callerName?: string | null;
  installAddress?: string | null;
};

/** 警情详情-接警信息段 */
export type IncidentDetailAcceptInfo = {
  seatNo?: string | null;
  acceptTime?: string | null;
  disasterLevel?: string | null;
  keyUnitName?: string | null;
  disasterAddress?: string | null;
  burningMaterial?: string | null;
  isSupplement?: boolean | null;
  incidentMark?: string | null;
  smokeSituation?: string | null;
  trappedCount?: number | null;
  adminDivision?: string | null;
  disasterType?: { type?: string | null; subtype?: string | null } | null;
  contacterName?: string | null;
  contacterPhone?: string | null;
  leadStation?: string | null;
  longitude?: number | string | null;
  latitude?: number | string | null;
  acceptContent?: string | null;
};

/** 警情详情-出动单批次下的队站车辆 */
export type IncidentDetailVehicle = {
  vehicleId?: string | null;
  vehicleName?: string | null;
  vehicleTypeCode?: string | null;
  vehicleTypeName?: string | null;
  plateNo?: string | null;
  onboardPersonnelCount?: number | null;
  waterTons?: number | null;
  foamTons?: number | null;
};

/** 警情详情-出动单批次 */
export type IncidentDetailDispatchBatch = {
  batchId?: string | null;
  kind?: string | null;
  seq?: number | null;
  dispatchedAt?: string | null;
  vehicleCount?: number | null;
  stations?: {
    stationId?: string | null;
    stationName?: string | null;
    vehicleCount?: number | null;
    vehicles?: IncidentDetailVehicle[] | null;
  }[] | null;
};

/** GET /bff-client/api/v1/gis/incidents/{incidentId}/detail 响应 data（alova 已解包外壳） */
export type IncidentDetailResponseData = {
  alarmInfo?: IncidentDetailAlarmInfo | null;
  acceptInfo?: IncidentDetailAcceptInfo | null;
  dispatchInfo?: { batches?: IncidentDetailDispatchBatch[] | null } | null;
};

/** 出动单信息表格行：batch × station 平铺，车辆逐行文本 */
export type DispatchOrderRow = {
  dispatchedAt: string | null;
  stationName: string | null;
  vehicleText: string | null;
};

/** 警情详情固定弹窗展示字段（全部可选；本地快照兜底时仅含点位已知字段） */
export type IncidentDetailData = {
  // === 报警信息 ===
  /** 警单编号 */
  alarmOrderNo?: string | null;
  /** 呼入时间（展示原文或 dayjs 格式化后的字符串） */
  callInTime?: string | null;
  /** 接入类型（电话/上门/其他） */
  accessType?: string | null;
  /** 主叫号码 */
  callerPhone?: string | null;
  /** 机主姓名 */
  callerName?: string | null;
  /** 装机地址 */
  installAddress?: string | null;
  // === 接警信息 ===
  /** 接警席编号 */
  seatNo?: string | null;
  /** 接警时间 */
  receiveTime?: string | null;
  /** 灾害等级 */
  disasterGrade?: string | null;
  /** 重点单位名称 */
  keyUnitName?: string | null;
  /** 是否补录（接口布尔归一为"是/否"） */
  supplementary?: string | null;
  /** 灾害地址 */
  disasterAddress?: string | null;
  /** 燃烧物 */
  burningMaterial?: string | null;
  /** 警情标识（真警/虚警等） */
  alarmFlag?: string | null;
  /** 烟雾情况 */
  smokeSituation?: string | null;
  /** 人员受困人数 */
  trappedCount?: string | number | null;
  /** 行政区划 */
  administrativeDivision?: string | null;
  /** 灾害类型 */
  disasterType?: string | null;
  /** 报警人 */
  contacterName?: string | null;
  /** 联系电话 */
  contacterPhone?: string | null;
  /** 主管队站 */
  leadStation?: string | null;
  /** 位置信息-经度 */
  longitude?: string | null;
  /** 位置信息-纬度 */
  latitude?: string | null;
  /** 接警内容（多行文本） */
  acceptContent?: string | null;
  /** 出动单信息表格行；本地快照兜底时为空数组 */
  dispatchOrders?: DispatchOrderRow[];
};

const toText = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
};

/** 时间值格式化为 YYYY-MM-DD HH:mm:ss，空值/非法值返回 null */
const formatDetailTime = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const text = dayjs(value as string | number | Date);
  return text.isValid() ? text.format("YYYY-MM-DD HH:mm:ss") : null;
};

/** 灾害类型 type/subtype 以"/"组合，缺一个取另一个 */
const formatDisasterType = (value: IncidentDetailAcceptInfo["disasterType"]): string | null => {
  const parts = [toText(value?.type), toText(value?.subtype)].filter((x): x is string => !!x);
  return parts.length ? parts.join("/") : null;
};

/** 出动力量文本："水罐消防车（SG）【黑X5349】"，缺项分段省略 */
const formatVehicleLabel = (v: IncidentDetailVehicle): string | null => {
  const typeName = toText(v.vehicleTypeName);
  const typeCode = toText(v.vehicleTypeCode);
  const name = typeName ?? typeCode;
  const nameWithCode = name && typeName && typeCode ? `${name}（${typeCode}）` : name;
  const plate = toText(v.plateNo);
  const parts = [nameWithCode, plate ? `【${plate}】` : null].filter((x): x is string => !!x);
  return parts.length ? parts.join("") : null;
};

const toDispatchOrders = (data?: IncidentDetailResponseData | null): DispatchOrderRow[] => {
  const rows: DispatchOrderRow[] = [];
  for (const batch of data?.dispatchInfo?.batches ?? []) {
    const dispatchedAt = formatDetailTime(batch?.dispatchedAt);
    for (const station of batch?.stations ?? []) {
      const lines = (station?.vehicles ?? [])
        .map(formatVehicleLabel)
        .filter((x): x is string => !!x);
      rows.push({
        dispatchedAt,
        stationName: toText(station?.stationName),
        vehicleText: lines.length ? lines.join("\n") : null,
      });
    }
  }
  return rows;
};

/** 详情接口响应归一化为弹窗展示字段；缺失字段留空由组件统一渲染 "-" */
export const toIncidentDetailData = (
  data?: IncidentDetailResponseData | null,
): IncidentDetailData => {
  const alarm = data?.alarmInfo;
  const accept = data?.acceptInfo;
  return {
    alarmOrderNo: toText(alarm?.incidentNo),
    callInTime: formatDetailTime(alarm?.callInTime),
    accessType: toText(alarm?.accessType),
    callerPhone: toText(alarm?.callerPhone),
    callerName: toText(alarm?.callerName),
    installAddress: toText(alarm?.installAddress),
    seatNo: toText(accept?.seatNo),
    receiveTime: formatDetailTime(accept?.acceptTime),
    disasterGrade: toText(accept?.disasterLevel),
    keyUnitName: toText(accept?.keyUnitName),
    supplementary:
      accept?.isSupplement === true ? "是" : accept?.isSupplement === false ? "否" : null,
    disasterAddress: toText(accept?.disasterAddress),
    burningMaterial: toText(accept?.burningMaterial),
    alarmFlag: toText(accept?.incidentMark),
    smokeSituation: toText(accept?.smokeSituation),
    trappedCount: accept?.trappedCount ?? null,
    administrativeDivision: toText(accept?.adminDivision),
    disasterType: formatDisasterType(accept?.disasterType),
    contacterName: toText(accept?.contacterName),
    contacterPhone: toText(accept?.contacterPhone),
    leadStation: toText(accept?.leadStation),
    longitude: toText(accept?.longitude),
    latitude: toText(accept?.latitude),
    acceptContent: toText(accept?.acceptContent),
    dispatchOrders: toDispatchOrders(data),
  };
};
</script>

<script setup lang="ts">
/**
 * 警情详情固定弹窗（居中 Modal，非地图锚定）。
 * 三段结构对齐接处警业务：报警信息 / 接警信息 / 出动单信息；
 * 数据源为 GET /gis/incidents/{incidentId}/detail（本地快照兜底时缺失字段统一显示 "-"）。
 * 样式消费 Element Plus 主题变量，夜间/浅色主题自适应。
 */
import { computed } from "vue";
import { ElDialog } from "element-plus";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    data: IncidentDetailData | null;
    /** 详情接口拉取中：内容区 v-loading */
    loading?: boolean;
  }>(),
  { loading: false },
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

/** 明细行定义：span=2 独占整行；secondValue 位置信息双值；multiline 多行文本 */
type DetailRowDef = {
  label: string;
  value: string;
  span?: 2;
  multiline?: boolean;
  secondValue?: string;
};

const formatValue = (value: IncidentDetailData[keyof IncidentDetailData]) => {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
};

const buildRows = (data: IncidentDetailData | null): DetailRowDef[] => [
  { label: "接警席编号", value: formatValue(data?.seatNo) },
  { label: "接警时间", value: formatValue(data?.receiveTime) },
  { label: "灾害等级", value: formatValue(data?.disasterGrade) },
  { label: "重点单位名称", value: formatValue(data?.keyUnitName) },
  { label: "是否补录", value: formatValue(data?.supplementary) },
  { label: "灾害地址", value: formatValue(data?.disasterAddress), span: 2 },
  { label: "燃烧物", value: formatValue(data?.burningMaterial) },
  { label: "警情标识", value: formatValue(data?.alarmFlag) },
  { label: "烟雾情况", value: formatValue(data?.smokeSituation) },
  { label: "人员受困人数", value: formatValue(data?.trappedCount) },
  { label: "行政区划", value: formatValue(data?.administrativeDivision), span: 2 },
  { label: "灾害类型", value: formatValue(data?.disasterType), span: 2 },
  { label: "报警人", value: formatValue(data?.contacterName) },
  { label: "联系电话", value: formatValue(data?.contacterPhone) },
  { label: "主管队站", value: formatValue(data?.leadStation), span: 2 },
  {
    label: "位置信息",
    value: formatValue(data?.longitude),
    secondValue: formatValue(data?.latitude),
    span: 2,
  },
  { label: "接警内容", value: formatValue(data?.acceptContent), span: 2, multiline: true },
];

const callRows = computed<DetailRowDef[]>(() => [
  { label: "警单编号", value: formatValue(props.data?.alarmOrderNo) },
  { label: "呼入时间", value: formatValue(props.data?.callInTime) },
  { label: "接入类型", value: formatValue(props.data?.accessType) },
  { label: "主叫号码", value: formatValue(props.data?.callerPhone) },
  { label: "装机地址", value: formatValue(props.data?.installAddress) },
  { label: "机主姓名", value: formatValue(props.data?.callerName) },
]);

const receiveRows = computed<DetailRowDef[]>(() => buildRows(props.data));

const dispatchOrders = computed<DispatchOrderRow[]>(() => props.data?.dispatchOrders ?? []);
</script>

<template>
  <el-dialog v-model="visible" title="警情详情" width="760px" append-to-body class="incident-detail-dialog">
    <div v-loading="loading" class="detail_body">
      <div class="detail_section">
        <div class="detail_section_title">报警信息</div>
        <div class="detail_grid">
          <div
            v-for="row in callRows"
            :key="row.label"
            class="detail_item"
            :class="{ detail_item_full: row.span === 2 }"
          >
            <span class="detail_label">{{ row.label }}</span>
            <span class="detail_value" :class="{ detail_value_multiline: row.multiline }">
              {{ row.value }}
            </span>
          </div>
        </div>
      </div>

      <div class="detail_section">
        <div class="detail_section_title">接警信息</div>
        <div class="detail_grid">
          <div
            v-for="row in receiveRows"
            :key="row.label"
            class="detail_item"
            :class="{ detail_item_full: row.span === 2 }"
          >
            <span class="detail_label">{{ row.label }}</span>
            <span class="detail_value" :class="{ detail_value_multiline: row.multiline }">
              {{ row.value }}
            </span>
            <span v-if="row.secondValue !== undefined" class="detail_value">
              {{ row.secondValue }}
            </span>
          </div>
        </div>
      </div>

      <div class="detail_section">
        <div class="detail_section_title">出动单信息</div>
        <el-table v-if="dispatchOrders.length" :data="dispatchOrders" size="small" class="detail_table">
          <el-table-column prop="dispatchedAt" label="下达时间" min-width="150" />
          <el-table-column prop="stationName" label="出动单位" min-width="120" />
          <el-table-column label="出动力量" min-width="220">
            <template #default="{ row }">
              <span class="detail_vehicles">{{ row.vehicleText ?? "-" }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-else class="detail_empty">暂无出动单</div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
/* 内容区限高与接入详情接口前（两段结构）的弹窗高度一致，超出部分滚动查看 */
.detail_body {
  max-height: 400px;
  overflow-y: auto;
  padding-right: 8px;
}

.detail_section + .detail_section {
  margin-top: 16px;
}

.detail_section_title {
  position: relative;
  padding-left: 10px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.2;
}

.detail_section_title::before {
  content: "";
  position: absolute;
  left: 0;
  top: 1px;
  bottom: 1px;
  width: 3px;
  border-radius: 2px;
  background: var(--el-color-primary, #409eff);
}

.detail_grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 20px;
}

.detail_item {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 28px;
}

.detail_item_full {
  grid-column: 1 / -1;
}

.detail_item:has(.detail_value + .detail_value) {
  grid-template-columns: 92px minmax(0, 1fr) minmax(0, 1fr);
}

.detail_label {
  color: var(--el-text-color-regular);
  white-space: nowrap;
  text-align: justify;
  text-align-last: justify;
}

.detail_value {
  padding: 0 10px;
  color: var(--el-text-color-primary);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail_value_multiline {
  white-space: pre-wrap;
  word-break: break-all;
  overflow: visible;
}

.detail_vehicles {
  white-space: pre-line;
  line-height: 1.6;
}

.detail_table {
  --el-table-border-color: var(--el-border-color-light);
}

.detail_empty {
  padding: 8px 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
