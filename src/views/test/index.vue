<!--
 * @Author: huanghuanrong
 * @Date: 2026-04-15 14:12:49
 * @LastEditTime: 2026-04-15 17:21:22
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \OpenlayersMap\src\views\test\index.vue
-->
<template>
<div id="map-dd" class="map-container"></div>
</template>

<script setup lang="ts">
// import { NewGisBimApp, createAppInstance } from '@hhr001/openlayers-map-lib';
import { onMounted } from 'vue';

import mitt from "mitt";

const emitter = mitt();
// const app = new NewGisBimApp(emitter);

onMounted(() => {
  // app.mount({
  //   container: "#map-dd",
  //   props: {
  //     token: "xxx"
  //   }
  // });
})

// onMounted(() => {
//   const map = createAppInstance({
//    container: '#map',
//   });
// });



</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100%;
}
</style>
