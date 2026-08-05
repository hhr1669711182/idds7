/*
 * @Author: hhr
 * @Date: 2026-06-16 10:26:42
 * @LastEditTime: 2026-06-17 10:44:45
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\composables\useCurrentMap.ts
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useMapStore, useDispatchMapStore } from "@/store";

export const useCurrentMap = () => {
  const route = useRoute();
  const mapStore = useMapStore();
  const dispatchMapStore = useDispatchMapStore();

  const currentMap = computed(() => {
    const path = route?.path || window.location.hash;
    if (path.includes("/dispatch")) {
      return dispatchMapStore.map;
    }
    return mapStore.map;
  });

  return { currentMap };
};
