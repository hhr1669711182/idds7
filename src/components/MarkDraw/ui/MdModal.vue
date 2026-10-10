<script setup lang="ts">
/**
 * 自写 Modal：遮罩 + 居中 + 标题 + 内容 + 底部按钮
 *
 * 样式放在全局 styles/toast.less（.md-modal* / .md-modal-btn*），
 * 因为 MdMessageBox 用 createApp 动态挂载本组件，scoped 选择器不生效。
 * Teleport 到 body，避免被地图容器的 overflow 裁剪。
 */
defineProps<{
  open: boolean;
  title?: string;
  width?: string;
  /** 确定按钮风格：primary（蓝）/ danger（红） */
  variant?: "primary" | "danger";
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
              <button
                class="md-modal-btn"
                :class="variant === 'danger' ? 'md-modal-btn--danger' : 'md-modal-btn--primary'"
                @click="ok"
              >
                确定
              </button>
            </slot>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>