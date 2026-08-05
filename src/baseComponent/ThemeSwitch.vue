<script setup lang="ts">
import { computed } from "vue";
import dayImg from "../assets/day.svg";
import nightImg from "../assets/night.svg";
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
  <div>
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
:deep(.el-switch__action) {
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: #000;
}

:deep(.el-switch.is-checked .el-switch__core .el-switch__action) {
  background-color: #fff !important;
}

img {
  width: 20px;
  height: 20px;
}

:deep(.el-switch.is-checked .el-switch__core) {
  background-color: #fff;
  border-color: #6b6464c9;
}

:deep(.el-switch__core) {
  background-color: #000;
}
</style>
