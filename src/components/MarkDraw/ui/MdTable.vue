<script setup lang="ts">
/**
 * 自写轻量表格：纯 CSS，支持 rowClick + rowClassName + 选中高亮
 */
defineProps<{
  columns: Array<{ key: string; label: string; width?: string; type?: "selection" }>;
  rows: Record<string, unknown>[];
  activeId?: string | number | null;
  loading?: boolean;
  emptyText?: string;
}>();
const emit = defineEmits<{
  (e: "row-click", row: Record<string, unknown>): void;
  (e: "row-dblclick", row: Record<string, unknown>): void;
  (e: "selection-change", rows: Record<string, unknown>[]): void;
}>();

const isSelected = (id: unknown, activeId: unknown) => String(id) === String(activeId);

const onSelect = (row: Record<string, unknown>, checked: boolean, rows: Record<string, unknown>[]) => {
  row.__selected = checked;
  emit("selection-change", rows.filter((r) => r.__selected));
};
void isSelected;
</script>

<template>
  <div class="md-table">
    <div class="md-table__head">
      <div
        v-for="col in columns"
        :key="col.key"
        class="md-table__cell md-table__cell--head"
        :style="{ width: col.width }"
      >
        <input
          v-if="col.type === 'selection'"
          type="checkbox"
          class="md-table__check"
          :checked="rows.length > 0 && rows.every((r) => r.__selected)"
          @change="(e) => {
            const checked = (e.target as HTMLInputElement).checked;
            rows.forEach((r) => (r.__selected = checked));
            emit('selection-change', checked ? rows.slice() : []);
          }"
        />
        <span v-else>{{ col.label }}</span>
      </div>
    </div>
    <div class="md-table__body">
      <div v-if="loading" class="md-table__loading">加载中…</div>
      <div v-else-if="!rows.length" class="md-table__empty">{{ emptyText ?? "暂无数据" }}</div>
      <div
        v-for="(row, idx) in rows"
        v-else
        :key="String(row.id ?? idx)"
        class="md-table__row"
        :class="{
          'is-active': String(row.id) === String(activeId),
          'is-selected': !!row.__selected,
        }"
        @click="emit('row-click', row)"
        @dblclick="emit('row-dblclick', row)"
      >
        <div
          v-for="col in columns"
          :key="col.key"
          class="md-table__cell"
          :style="{ width: col.width }"
        >
          <input
            v-if="col.type === 'selection'"
            type="checkbox"
            class="md-table__check"
            :checked="!!row.__selected"
            @click.stop
            @change="(e) => onSelect(row, (e.target as HTMLInputElement).checked, rows)"
          />
          <span v-else class="md-table__cell-text">{{ row[col.key] ?? "" }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.md-table {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: #d6e1ee;
}
.md-table__head {
  display: flex;
  background: rgba(0, 30, 60, 0.4);
  border-bottom: 1px solid rgba(120, 180, 230, 0.18);
}
.md-table__cell {
  flex: 1;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.md-table__cell--head {
  font-size: 11px;
  color: rgba(180, 200, 220, 0.6);
  font-weight: 500;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.md-table__body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.md-table__row {
  display: flex;
  border-bottom: 1px solid rgba(120, 180, 230, 0.08);
  cursor: pointer;
  transition: background 0.12s ease;
}
.md-table__row:hover {
  background: rgba(0, 212, 255, 0.08);
}
.md-table__row.is-active {
  background: rgba(0, 212, 255, 0.18) !important;
  color: #5ee0ff;
  font-weight: 600;
}
.md-table__row.is-active::before {
  content: "";
  position: absolute;
  left: 0;
  width: 2px;
  height: 100%;
  background: linear-gradient(180deg, #00d4ff, transparent);
}
.md-table__row {
  position: relative;
}
.md-table__row.is-selected {
  background: rgba(46, 204, 113, 0.08);
}
.md-table__cell-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}
.md-table__check {
  accent-color: #00d4ff;
  cursor: pointer;
}
.md-table__loading,
.md-table__empty {
  padding: 24px;
  text-align: center;
  color: rgba(180, 200, 220, 0.5);
  font-size: 12px;
}
.md-table__body::-webkit-scrollbar {
  width: 6px;
}
.md-table__body::-webkit-scrollbar-thumb {
  background: rgba(120, 180, 230, 0.25);
  border-radius: 3px;
}
</style>
