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
  border-radius: var(--radius-sm);
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
  background: var(--tag-default-bg);
  color: var(--tag-default-text);
  border-color: var(--tag-default-border);
}
.md-tag--primary {
  background: var(--tag-primary-bg);
  color: var(--tag-primary-text);
  border-color: var(--tag-primary-border);
}
.md-tag--success {
  background: var(--tag-success-bg);
  color: var(--tag-success-text);
  border-color: var(--tag-success-border);
}
.md-tag--warning {
  background: var(--tag-warning-bg);
  color: var(--tag-warning-text);
  border-color: var(--tag-warning-border);
}
.md-tag--danger {
  background: var(--tag-danger-bg);
  color: var(--tag-danger-text);
  border-color: var(--tag-danger-border);
}
.md-tag--info {
  background: var(--tag-info-bg);
  color: var(--tag-info-text);
  border-color: var(--tag-info-border);
}
</style>
