<script setup lang="ts">
import { computed } from "vue";
import dayImg from "@/assets/ui/theme/day.svg";
import nightImg from "@/assets/ui/theme/night.svg";
import { useCommonStore } from "../store/index.ts";
import { storeToRefs } from "pinia";
import { THEME_COLOR } from "../const/index.ts";

const commonStore = useCommonStore();

const { themeColor } = storeToRefs(commonStore);

const colorFlag = computed(() => {
  return themeColor.value == THEME_COLOR.DAY;
});

const changeThemeColor = (flag: boolean) => {
  const theme = flag ? THEME_COLOR.DAY : THEME_COLOR.NIGHT;
  commonStore.setThemeColor(theme);
  document.documentElement.setAttribute("data-theme", theme);
};
</script>
<template>
  <div class="theme-switch">
    <el-switch v-model="colorFlag" size="large" @change="changeThemeColor">
      <template #active-action>
        <img :src="dayImg" />
      </template>
      <template #inactive-action>
        <img :src="nightImg" />
      </template>
    </el-switch>
  </div>
</template>
<style scoped>
.theme-switch {
  position: fixed;
  top: calc(var(--top-actions-center) - var(--top-actions-switch-height) / 2);
  right: calc(
    var(--top-actions-right) + var(--weather-panel-width) + var(--top-actions-gap) +
      2 * (var(--top-actions-size) + var(--top-actions-gap))
  );
  z-index: 1000;
  width: var(--top-actions-switch-width);
  height: var(--top-actions-switch-height);
  display: flex;
  align-items: center;
}
:deep(.el-switch__action) {
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--panel-bg-solid);
}

:deep(.el-switch.is-checked .el-switch__core .el-switch__action) {
  background-color: var(--primary-color) !important;
}

img {
  width: 20px;
  height: 20px;
}

:deep(.el-switch.is-checked .el-switch__core) {
  background-color: var(--accent-cyan-soft);
  border-color: var(--accent-cyan);
}

:deep(.el-switch__core) {
  background-color: var(--panel-bg-solid);
  border-color: var(--widget-border);
}
</style>
