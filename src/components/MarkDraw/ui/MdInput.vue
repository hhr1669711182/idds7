<script setup lang="ts">
/**
 * 自写输入框：支持 v-model + textarea + readonly + disabled
 */
const props = defineProps<{
  modelValue: string | number | undefined;
  type?: "text" | "textarea";
  placeholder?: string;
  readonly?: boolean;
  disabled?: boolean;
  rows?: number;
}>();
const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
  /** 原生事件透传：调用方需要 blur / focus / keydown 等时用 */
  (e: "blur", ev: FocusEvent): void;
  (e: "focus", ev: FocusEvent): void;
  (e: "keydown", ev: KeyboardEvent): void;
}>();

const onInput = (e: Event) => {
  emit("update:modelValue", (e.target as HTMLInputElement | HTMLTextAreaElement).value);
};
void props;
</script>

<template>
  <div class="md-input" :class="{ 'is-disabled': disabled, 'is-readonly': readonly }">
    <textarea
      v-if="type === 'textarea'"
      class="md-input__field md-input__field--ta"
      :value="modelValue ?? ''"
      :placeholder="placeholder"
      :readonly="readonly"
      :disabled="disabled"
      :rows="rows ?? 2"
      @input="onInput"
      @blur="emit('blur', $event)"
      @focus="emit('focus', $event)"
      @keydown="emit('keydown', $event)"
    />
    <input
      v-else
      class="md-input__field"
      :value="modelValue ?? ''"
      :placeholder="placeholder"
      :readonly="readonly"
      :disabled="disabled"
      type="text"
      @input="onInput"
      @blur="emit('blur', $event)"
      @focus="emit('focus', $event)"
      @keydown="emit('keydown', $event)"
    />
  </div>
</template>

<style scoped>
.md-input {
  position: relative;
  background: var(--widget-bg);
  border: 1px solid var(--widget-border);
  border-radius: var(--radius-md);
  transition: all 0.18s ease;
}
.md-input:focus-within {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 3px var(--accent-cyan-soft);
}
.md-input.is-disabled {
  opacity: 0.5;
}
.md-input.is-readonly {
  background: var(--card-bg);
}
.md-input__field {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 13px;
  padding: 7px 10px;
  font-family: inherit;
  box-sizing: border-box;
}
.md-input__field::placeholder {
  color: var(--text-muted);
}
.md-input__field--ta {
  resize: vertical;
  min-height: 32px;
  line-height: 1.5;
}
.md-input__field:read-only {
  color: var(--text-secondary);
  cursor: default;
}
</style>
