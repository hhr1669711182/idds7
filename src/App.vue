<!--
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-04-29 16:59:28
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\App.vue
-->
<script setup lang="ts">
import { onBeforeMount, onUnmounted } from "vue";
// import home from "./views/home.vue";
import IndexModal from "./components/Modals/index.vue";
import { initMessage } from "./Control/initMessage";

const container: Element | null = document.querySelector("#svgBase");
let cleanupMessage: (() => void) | null = null;

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
});

onUnmounted(() => {
  cleanupMessage?.();
  cleanupMessage = null;
});
</script>

<template>
  <!-- <home /> -->
  <index-modal />
  <router-view />
</template>

<style scoped></style>
