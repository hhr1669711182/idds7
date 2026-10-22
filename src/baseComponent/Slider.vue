<script setup lang="ts">
import { ref, watch } from "vue";
import type { Arrayable } from "element-plus/es/utils/typescript";

const props = defineProps({
  value: {
    type: Number,
    default: 0,
  },
  max: Number,
  min: Number,
  step: Number,
});

const sliderValue = ref(props.value);

watch(
  () => props.value,
  (newVal) => {
    sliderValue.value = newVal;
  }
);
const emit = defineEmits(["change"]);
// el-slider 的 change / input 回调参数为 Arrayable<number>（可能是数组）
const changeSlider = (val: Arrayable<number>) => {
  const nextValue = Array.isArray(val) ? val[0] : val;
  sliderValue.value = nextValue;
  emit("change", nextValue);
};
</script>
<template>
  <div class="slider">
    <el-slider
      v-model="sliderValue"
      :max="props.max"
      :step="props.step"
      :min="props.min"
      @change="changeSlider"
      @input="changeSlider"
    />
    <span>{{ sliderValue }}</span>
  </div>
</template>
<style scoped>
.slider {
  display: flex;
  justify-content: space-between;
  align-items: center;
  align-content: center;
  width: 100%;
}

span {
  font-size: 14px;
  margin-left: 20px;
}
</style>
