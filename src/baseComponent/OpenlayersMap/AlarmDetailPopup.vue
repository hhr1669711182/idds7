<script setup lang="ts">
import { computed } from "vue";
import OverlayTemplate from "./overlayTemplate.vue";

type AlarmDetailRow = {
  label: string;
  value?: string | number | null;
  visible?: boolean;
};

const props = withDefaults(
  defineProps<{
    visible: boolean;
    title: string;
    rows: AlarmDetailRow[];
    /** 底部操作按钮文案；传入时才显示（如"警情详情"） */
    detailButtonText?: string;
  }>(),
  { detailButtonText: "" },
);

defineEmits<{
  (e: "close"): void;
  (e: "detail"): void;
}>();

const displayRows = computed(() => props.rows.filter((row) => row.visible !== false));

const formatValue = (value: AlarmDetailRow["value"]) => {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
};
</script>

<template>
  <OverlayTemplate :visible="visible" :title="title" @close="$emit('close')">
    <div v-for="row in displayRows" :key="row.label" class="alarm_detail_row">
      <span class="alarm_detail_k">{{ row.label }}</span>
      <span class="alarm_detail_v">{{ formatValue(row.value) }}</span>
    </div>
    <!-- 仅在有操作按钮时才提供 footer 插槽，避免 overlayTemplate 渲染空的 footer 分隔线 -->
    <template v-if="detailButtonText" #footer>
      <el-button
        size="small"
        type="primary"
        @click="$emit('detail')"
      >
        {{ detailButtonText }}
      </el-button>
    </template>
  </OverlayTemplate>
</template>

<style scoped>
.alarm_detail_row {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 8px;
  font-size: 12px;
  color: #111827;
}

.alarm_detail_k {
  color: rgba(17, 24, 39, 0.7);
  white-space: nowrap;
}

.alarm_detail_v {
  word-break: break-all;
}
</style>
