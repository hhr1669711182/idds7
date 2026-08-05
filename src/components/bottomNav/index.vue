<!--
 * @Author: hhr
 * @Date: 2026-04-21 15:48:37
 * @LastEditTime: 2026-06-02 15:18:34
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\bottomNav\index.vue
-->
<template>
    <div class="bottom_nav_tab">
      <div
        v-for="tab in tabs"
        :key="tab.name"
        class="tab_item"
        :class="{ tab_item_active: tab.name == activeTab }"
        @click="handleClick(tab)"
      >
        <img :src="tab.icon" alt="" />
        {{ tab.label }}
      </div>
    </div>
</template>

<script setup lang="ts">
import { useTabsStore } from "@/store";
import ljImg from "@/assets/svg/lj.svg";
import xcImg from "@/assets/svg/xc.svg";
import zjImg from "@/assets/svg/jz.svg";
const tabsStore = useTabsStore();
const { activeTab } = storeToRefs(tabsStore);
const tabs = ref([
  {
    label: "全域地图",
    name: 1,
    icon: ljImg,
    path: "/map",
  },
  {
    label: "现场态势",
    name: 2,
    icon: xcImg,
    path: "/ThreejsViewerRegion",
  },
  {
    label: "建筑模型",
    name: 3,
    icon: zjImg,
    path: "/viewerInquiryBuilding",
  },
  // {
  //   label: "建筑剖面",
  //   name: 3,
  //   icon: zjImg,
  //   path: "/ThreejsViewerBuilding",
  // },
]);

const router = useRouter();

const handleClick = (tab: any) => {
  tabsStore.setActiveTab(tab.name)
  router.push(tab.path);
}
</script>

<style scoped lang="less">
.bottom_nav_tab {
  position: absolute;
  bottom: 0.5em;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  pointer-events: none;
  width: 100%;
  height: 40px;
  background: url("@/assets/bottomBg.png") center no-repeat;
  background-size: 100% 100%;

  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;

  .tab_item {
  pointer-events: auto;
  /* width: 56px; */
  /* height: 20px; */
  font-family:
    PingFangSC,
    PingFang SC;
  font-weight: 500;
  font-size: 14px;
  color: #ffffff;
  line-height: 20px;
  text-align: left;
  font-style: normal;
  opacity: 0.5;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  pointer-events: pointer;
  cursor: pointer;
}

.tab_item_active {
  opacity: 1;
}

.tab_item img {
  width: 20px;
  height: 20px;
}
}

</style>