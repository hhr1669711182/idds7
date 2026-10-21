<template>
  <div class="overlay_popup" v-show="visible">
    <div class="overlay_popup_header">
      <div class="overlay_popup_title">{{ title }}</div>
      <button class="overlay_popup_close" type="button" @click="$emit('close')">×</button>
    </div>
    <div class="overlay_popup_body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="overlay_popup_footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
  title: string;
}>();

defineEmits(["close"]);
</script>

<style scoped>
.overlay_popup {
  min-width: 280px;
  max-width: 420px;
  padding: 10px;
  border-radius: var(--radius-lg);
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  box-shadow: var(--panel-shadow);
  backdrop-filter: blur(var(--glass-blur));
  pointer-events: auto;
}

.overlay_popup_header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.overlay_popup_title {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overlay_popup_close {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-md);
  border: 1px solid var(--widget-border);
  background: var(--panel-bg-solid);
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1;
}

.overlay_popup_body {
  margin-top: 8px;
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--text-primary);
}

.overlay_popup_footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--widget-border);
  display: flex;
  justify-content: flex-end;
}
</style>
