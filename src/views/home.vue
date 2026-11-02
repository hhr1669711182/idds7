<!--
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-10-20 12:04:30
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\views\home.vue
-->
<script setup>
import { ref, reactive, watch, computed } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import GithubIcon from "../baseComponent/GithubIcon.vue";
import ModeChange from "../components/common/ModeChange.vue";
import { useMapStore } from "../store";
import ThemeSwitch from "../baseComponent/ThemeSwitch.vue";
import Map from "../components/map/index.vue";
import DispatchMapPage from "../components/dispatchMap/index.vue";
import { isDispatchVariant } from "../baseComponent/OpenlayersMap/gisMapConfig";

// 合并归一（路线 X）：/map 为唯一入口，按共享态派生 variant 互斥挂主/调派包装层。
// 切换 = 重挂包装层，等价原 /map↔/dispatch 路由跳转语义；无新增 state 字段。
const dispatchVariant = computed(() => isDispatchVariant());
</script>

<template>
  <div class="main">
    <ThemeSwitch />

    <!-- 合并归一（路线 X）：同一 /map 入口，按 variant 互斥挂主/调派包装层。
         切 variant = 重挂包装层，等价原 /map↔/dispatch 跳转语义（现有效果）。 -->
    <DispatchMapPage v-if="dispatchVariant" />
    <Map v-else />

    <AddressRobotDrawer v-if="true" />
  </div>
</template>
<style scoped>
.main {
  height: 100%;
  width: 100%;
}
</style>
