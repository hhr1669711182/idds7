<template>
  <div class="overlay_popup" v-show="visible">
    <div class="overlay_popup_header">
      <div class="overlay_popup_title">{{ title }}</div>
      <button class="overlay_popup_close" type="button" @click="$emit('close')">
        ×
      </button>
    </div>
    <div class="overlay_popup_body">
      <slot />
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
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
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
  color: #111827;
  font-weight: 600;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overlay_popup_close {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  line-height: 1;
}

.overlay_popup_body {
  margin-top: 8px;
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: #111827;
}
</style>
