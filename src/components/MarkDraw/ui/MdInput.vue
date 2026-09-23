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
    />
  </div>
</template>

<style scoped>
.md-input {
  position: relative;
  background: rgba(10, 18, 32, 0.6);
  border: 1px solid rgba(120, 180, 230, 0.18);
  border-radius: 6px;
  transition: all 0.18s ease;
}
.md-input:focus-within {
  border-color: rgba(0, 212, 255, 0.6);
  box-shadow: 0 0 0 3px rgba(0, 212, 255, 0.12);
}
.md-input.is-disabled {
  opacity: 0.5;
}
.md-input.is-readonly {
  background: rgba(10, 18, 32, 0.4);
}
.md-input__field {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: #e8f0fa;
  font-size: 13px;
  padding: 7px 10px;
  font-family: inherit;
  box-sizing: border-box;
}
.md-input__field::placeholder {
  color: rgba(180, 200, 220, 0.4);
}
.md-input__field--ta {
  resize: vertical;
  min-height: 32px;
  line-height: 1.5;
}
.md-input__field:read-only {
  color: rgba(220, 230, 240, 0.7);
  cursor: default;
}
</style>
