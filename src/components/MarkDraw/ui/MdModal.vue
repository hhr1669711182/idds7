<script setup lang="ts">
/**
 * 自写 Modal：简单遮罩 + 居中 + 标题 + 内容 + 底部按钮
 */
defineProps<{
  open: boolean;
  title?: string;
  width?: string;
}>();
const emit = defineEmits<{
  (e: "update:open", v: boolean): void;
  (e: "ok"): void;
  (e: "cancel"): void;
}>();

const close = () => {
  emit("update:open", false);
  emit("cancel");
};
const ok = () => {
  emit("ok");
};
</script>

<template>
  <Teleport to="body">
    <transition name="md-modal">
      <div v-if="open" class="md-modal-mask" @click.self="close">
        <div class="md-modal" :style="{ width: width ?? '380px' }">
          <div v-if="title" class="md-modal__header">
            <span class="md-modal__title">{{ title }}</span>
            <button class="md-modal__close" @click="close">×</button>
          </div>
          <div class="md-modal__body">
            <slot />
          </div>
          <div class="md-modal__footer">
            <slot name="footer">
              <button class="md-modal-btn md-modal-btn--default" @click="close">取消</button>
              <button class="md-modal-btn md-modal-btn--primary" @click="ok">确定</button>
            </slot>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.md-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(5, 12, 24, 0.7);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
.md-modal {
  background: linear-gradient(180deg, rgba(20, 30, 48, 0.95) 0%, rgba(14, 22, 36, 0.95) 100%);
  border: 1px solid rgba(0, 212, 255, 0.25);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(0, 212, 255, 0.1);
  color: #e8f0fa;
  overflow: hidden;
  max-width: calc(100vw - 40px);
}
.md-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(120, 180, 230, 0.15);
}
.md-modal__title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.5px;
}
.md-modal__close {
  background: transparent;
  border: none;
  color: rgba(180, 200, 220, 0.7);
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
}
.md-modal__close:hover {
  color: #ff5b7a;
}
.md-modal__body {
  padding: 18px;
  font-size: 13px;
  line-height: 1.6;
}
.md-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid rgba(120, 180, 230, 0.15);
}
.md-modal-btn {
  height: 28px;
  padding: 0 14px;
  border-radius: 6px;
  border: 1px solid rgba(120, 180, 230, 0.25);
  background: transparent;
  color: #d6e1ee;
  cursor: pointer;
  font-size: 12px;
}
.md-modal-btn--primary {
  background: linear-gradient(135deg, #00d4ff, #4dabf7);
  color: #0a1525;
  border-color: transparent;
  font-weight: 600;
}
.md-modal-btn:hover {
  border-color: #00d4ff;
}
.md-modal-enter-active,
.md-modal-leave-active {
  transition: opacity 0.18s ease;
}
.md-modal-enter-from,
.md-modal-leave-to {
  opacity: 0;
}
</style>
