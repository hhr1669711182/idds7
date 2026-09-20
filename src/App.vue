<!--
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-09-18 11:07:33
 * @LastEditors: hhr
 * @Description: 应用入口
 * @FilePath: \ids-gis-web\src\App.vue
-->
<script setup lang="ts">
import { onBeforeMount, onUnmounted } from "vue";
import IndexModal from "./components/Modals/index.vue";
import { initMessage } from "./register/initMessage.ts";
import { initUserStore } from "@/store/useUserStore";
import { initPageConditionListener } from "./Control/pageCondition";

const cleanups: Array<() => void> = [];

const registrations: Array<() => () => void> = [
  initUserStore,
  initMessage,
  initPageConditionListener,
];

const fetchSymbols = () => {
  const container = document.querySelector("#svgBase");
  fetch("./icons.svg")
    .then(response => response.text())
    .then(content => {
      if (container && content) container.innerHTML = content;
    });
};

onMounted(() => {
  fetchSymbols();
  for (const register of registrations) cleanups.push(register());
});

onUnmounted(() => {
  for (const cleanup of cleanups) cleanup();
  cleanups.length = 0;
});
</script>

<template>
  <index-modal />
  <router-view />
</template>

<style scoped></style>