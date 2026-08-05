/*
 * @Author: huanghuanrong
 * @Date: 2026-04-09 17:11:03
 * @LastEditTime: 2026-04-21 17:07:27
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\store\useTabsStore.ts
 */
import { defineStore } from "pinia";
import { ref } from "vue";
import { useRouter } from "vue-router";

const STORAGE_KEY = "OPENLAYERS_ACTIVE_TAB";

const loadActiveTab = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1;
};

export const useTabsStore = defineStore("tabsStore", () => {
  const router = useRouter();

  const activeTab = ref<number>(loadActiveTab() || 1);
  const tabs = ref<any>({
    1: "/map",
    2: "/ThreejsViewerRegion",
    3: "/ThreejsViewerBuilding",
  });

  const setActiveTab = (tab: number) => {
    activeTab.value = tab;
    localStorage.setItem(STORAGE_KEY, `${tab}`);
    router.push(tabs.value[tab]);
  };

  return {
    activeTab,
    setActiveTab,
  };
});
