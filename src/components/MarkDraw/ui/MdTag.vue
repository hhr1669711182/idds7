<script setup lang="ts">
/**
 * 自写 Tag
 */
defineProps<{
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
}>();
</script>

<template>
  <span class="md-tag" :class="[`md-tag--${variant ?? 'default'}`, `md-tag--${size ?? 'sm'}`]">
    <slot />
  </span>
</template>

<style scoped>
.md-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  padding: 2px 7px;
  border: 1px solid transparent;
}
.md-tag--md {
  font-size: 12px;
  padding: 3px 10px;
}
.md-tag--default {
  background: rgba(120, 180, 230, 0.12);
  color: #aac6e8;
  border-color: rgba(120, 180, 230, 0.25);
}
.md-tag--primary {
  background: rgba(0, 212, 255, 0.15);
  color: #5ee0ff;
  border-color: rgba(0, 212, 255, 0.4);
}
.md-tag--success {
  background: rgba(46, 204, 113, 0.18);
  color: #2ecc71;
  border-color: rgba(46, 204, 113, 0.45);
}
.md-tag--warning {
  background: rgba(230, 162, 60, 0.18);
  color: #f5a623;
  border-color: rgba(230, 162, 60, 0.45);
}
.md-tag--danger {
  background: rgba(245, 54, 92, 0.18);
  color: #ff5b7a;
  border-color: rgba(245, 54, 92, 0.45);
}
.md-tag--info {
  background: rgba(180, 200, 220, 0.1);
  color: #b6c5d4;
  border-color: rgba(180, 200, 220, 0.25);
}
</style>
