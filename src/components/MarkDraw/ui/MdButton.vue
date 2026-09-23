<script setup lang="ts">
/**
 * 自写按钮：支持 variant + size + loading + icon
 */
defineProps<{
  variant?: "primary" | "default" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
}>();
</script>

<template>
  <button
    class="md-btn"
    :class="[`md-btn--${variant ?? 'default'}`, `md-btn--${size ?? 'sm'}`, { 'is-loading': loading, 'is-disabled': disabled }]"
    :disabled="disabled || loading"
    type="button"
  >
    <span v-if="loading" class="md-btn__spinner" />
    <svg v-else-if="icon" class="md-btn__icon" aria-hidden="true">
      <use :xlink:href="icon" />
    </svg>
    <span class="md-btn__label"><slot /></span>
  </button>
</template>

<style scoped>
.md-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--md-border, rgba(120, 180, 230, 0.18));
  border-radius: 6px;
  background: rgba(20, 30, 48, 0.6);
  color: var(--md-text, #d6e1ee);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  white-space: nowrap;
  user-select: none;
}
.md-btn--sm {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
}
.md-btn--md {
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
}
.md-btn--primary {
  background: linear-gradient(135deg, #00d4ff 0%, #4dabf7 100%);
  color: #0a1525;
  border-color: transparent;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(0, 212, 255, 0.25);
}
.md-btn--primary:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgba(0, 212, 255, 0.4);
  transform: translateY(-1px);
}
.md-btn--danger {
  background: linear-gradient(135deg, #f5365c 0%, #f56036 100%);
  color: #fff;
  border-color: transparent;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(245, 54, 92, 0.25);
}
.md-btn--danger:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgba(245, 54, 92, 0.4);
  transform: translateY(-1px);
}
.md-btn--ghost {
  background: transparent;
  border-color: rgba(120, 180, 230, 0.3);
  color: var(--md-text, #d6e1ee);
}
.md-btn:hover:not(:disabled) {
  border-color: rgba(0, 212, 255, 0.5);
  color: #fff;
  background: rgba(20, 40, 70, 0.8);
}
.md-btn.is-disabled,
.md-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.md-btn__icon {
  width: 14px;
  height: 14px;
  fill: currentColor;
}
.md-btn__spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: md-btn-spin 0.6s linear infinite;
}
@keyframes md-btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
