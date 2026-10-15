<!--
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-10-14 19:33:10
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\App.vue
-->
<script setup lang="ts">
import { onBeforeMount, onUnmounted } from "vue";
import IndexModal from "./components/Modals/index.vue";
import { initMessage } from "@/register/initMessage";
import { initPageConditionListener } from "./Control/pageCondition";

const container: Element | null = document.querySelector("#svgBase");
let cleanupMessage: (() => void) | null = null;
let cleanupPageCondition: (() => void) | null = null;

const fetchSymbols = () => {
  fetch("./icons.svg")
    .then((response) => response.text())
    .then((content) => {
      if (container && content) {
        container.innerHTML = content;
      }
    });
};

onBeforeMount(() => {
  fetchSymbols();
  cleanupMessage = initMessage();
  cleanupPageCondition = initPageConditionListener();
});

onUnmounted(() => {
  cleanupMessage?.();
  cleanupMessage = null;
  cleanupPageCondition?.();
  cleanupPageCondition = null;
});
</script>

<template>
  <index-modal />
  <router-view />
</template>

<style scoped></style>
