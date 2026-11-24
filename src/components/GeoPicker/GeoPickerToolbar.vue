<template>
  <div class="geo-picker-toolbar">
    <button
      class="geo-picker-toolbar__btn"
      type="button"
      title="撤销"
      :disabled="!canUndo"
      @click="$emit('undo')"
    >撤销</button>
    <button
      class="geo-picker-toolbar__btn"
      type="button"
      title="重做"
      :disabled="!canRedo"
      @click="$emit('redo')"
    >重做</button>
    <button
      class="geo-picker-toolbar__btn"
      type="button"
      title="清除"
      @click="$emit('clear')"
    >清除</button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ canUndo: boolean; canRedo: boolean }>()
defineEmits<{ undo: []; redo: []; clear: [] }>()
</script>

<style lang="less" scoped>
.geo-picker-toolbar {
  position: absolute;
  top: var(--space-md);
  right: var(--space-md);
  z-index: 10;
  display: flex;
  padding: var(--space-xs);
  background: var(--glass-bg);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-md);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(var(--glass-blur));

  &__btn {
    height: 32px;
    padding: 0 12px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 13px;
    transition: background 0.15s ease;
    margin-right: 4px;

    &:last-child { margin-right: 0; }
    &:hover:not(:disabled) { background: var(--hover-bg); }
    &:disabled {
      color: var(--text-muted);
      cursor: not-allowed;
    }
  }
}
</style>
