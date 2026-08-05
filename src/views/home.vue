<!--
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-04-02 17:24:43
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \OpenlayersMap\src\view\home.vue
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
  </div>
</template>
<style scoped>
.main {
  height: 100%;
  width: 100%;
}
</style>
