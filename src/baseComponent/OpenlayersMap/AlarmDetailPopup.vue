<script setup lang="ts">
import { computed } from "vue";
import OverlayTemplate from "./overlayTemplate.vue";

type AlarmDetailRow = {
  label: string;
  value?: string | number | null;
  visible?: boolean;
};

const props = defineProps<{
  visible: boolean;
  title: string;
  rows: AlarmDetailRow[];
}>();

defineEmits<{
  (e: "close"): void;
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
  </OverlayTemplate>
</template>

<style scoped>
.alarm_detail_row {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 8px;
  font-size: 12px;
  color: #111827;
}

.alarm_detail_k {
  color: rgba(17, 24, 39, 0.7);
}

.alarm_detail_v {
  word-break: break-all;
}
</style>
