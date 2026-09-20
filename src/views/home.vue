<!--
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-09-11 18:15:51
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\views\home.vue
-->
<script setup>
import { ref, reactive, watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import GithubIcon from "../baseComponent/GithubIcon.vue";
import ModeChange from "../components/common/ModeChange.vue";
import { useMapStore } from "../store";
import ThemeSwitch from "../baseComponent/ThemeSwitch.vue";
import Map from "../components/map/index.vue";
</script>

<template>
  <div class="main">
    <!-- <ThemeSwitch /> -->
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
