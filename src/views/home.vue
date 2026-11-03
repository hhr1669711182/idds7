<!--
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-10-20 12:04:30
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\views\home.vue
-->
<script setup>
import Map from "../components/map/index.vue";
import ThemeSwitch from "../baseComponent/ThemeSwitch.vue";
</script>

<template>
  <div class="main">
    <ThemeSwitch />
    <!-- 路线 Y 收口：恒渲染主 Map 包装层；调派业务态由 map.vue 内 isDispatchVariant watch 切纠缠体承载 -->
    <Map />

    <AddressRobotDrawer v-if="true" />
  </div>
</template>
<style scoped>
.main {
  height: 100%;
  width: 100%;
}
</style>
