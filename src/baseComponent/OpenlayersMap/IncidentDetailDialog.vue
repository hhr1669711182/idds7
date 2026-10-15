<script setup lang="ts">
/**
 * 警情详情固定弹窗（居中 Modal，非地图锚定）。
 * 字段口径参照接处警业务的"报警信息 / 接警信息"两段结构；
 * 数据源（今日灾情/警情规划/警情定位）缺字段时统一显示 "-"。
 * 样式使用项目浅色 + Element Plus 风格，不沿用旧系统深色 UI。
 */
import { computed } from "vue";
import { ElDialog } from "element-plus";

/** 警情详情字段（全部可选，由调用方从点位数据归一化得到） */
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
  /** 是否补录 */
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
};

const props = defineProps<{
  modelValue: boolean;
  data: IncidentDetailData | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

/** 明细行定义（标签 → 字段名），保持与业务面板一致的两段顺序 */
type DetailRow = { label: string; key: keyof IncidentDetailData };
const CALL_INFO_ROWS: DetailRow[] = [
  { label: "警单编号", key: "alarmOrderNo" },
  { label: "呼入时间", key: "callInTime" },
  { label: "接入类型", key: "accessType" },
  { label: "主叫号码", key: "callerPhone" },
  { label: "机主姓名", key: "callerName" },
  { label: "装机地址", key: "installAddress" },
];
const RECEIVE_INFO_ROWS: DetailRow[] = [
  { label: "接警席编号", key: "seatNo" },
  { label: "接警时间", key: "receiveTime" },
  { label: "灾害等级", key: "disasterGrade" },
  { label: "重点单位名称", key: "keyUnitName" },
  { label: "是否补录", key: "supplementary" },
  { label: "灾害地址", key: "disasterAddress" },
  { label: "燃烧物质", key: "burningMaterial" },
  { label: "警情标识", key: "alarmFlag" },
  { label: "烟雾情况", key: "smokeSituation" },
  { label: "人员受困人数", key: "trappedCount" },
  { label: "行政区划", key: "administrativeDivision" },
  { label: "灾害类型", key: "disasterType" },
];

const formatValue = (value: IncidentDetailData[keyof IncidentDetailData]) => {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
};
</script>

<template>
  <el-dialog
    v-model="visible"
    title="警情详情"
    width="760px"
    append-to-body
    class="incident-detail-dialog"
  >
    <div class="detail_section">
      <div class="detail_section_title">报警信息</div>
      <div class="detail_grid">
        <div v-for="row in CALL_INFO_ROWS" :key="row.key" class="detail_item">
          <span class="detail_label">{{ row.label }}</span>
          <span class="detail_value">{{ formatValue(data?.[row.key]) }}</span>
        </div>
      </div>
    </div>

    <div class="detail_section">
      <div class="detail_section_title">接警信息</div>
      <div class="detail_grid">
        <div v-for="row in RECEIVE_INFO_ROWS" :key="row.key" class="detail_item">
          <span class="detail_label">{{ row.label }}</span>
          <span class="detail_value">{{ formatValue(data?.[row.key]) }}</span>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.detail_section + .detail_section {
  margin-top: 16px;
}

.detail_section_title {
  position: relative;
  padding-left: 10px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #111827;
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

.detail_label {
  color: rgba(17, 24, 39, 0.65);
  white-space: nowrap;
  text-align: justify;
  text-align-last: justify;
}

.detail_value {
  padding: 0 10px;
  color: #111827;
  background: rgba(17, 24, 39, 0.04);
  border: 1px solid rgba(17, 24, 39, 0.1);
  border-radius: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
