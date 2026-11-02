/*
 * @Author: hhr
 * @Date: 2026-06-16 10:26:42
 * @LastEditTime: 2026-06-17 10:44:45
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\composables\useCurrentMap.ts
 */
import { computed } from 'vue'
import { useMapStore } from '@/store'
import { useDispatchMapStore } from '@/store/useDispatchMapStore'
import { isDispatchVariant } from '@/baseComponent/OpenlayersMap/gisMapConfig'

export const useCurrentMap = () => {
  const mapStore = useMapStore()
  const dispatchMapStore = useDispatchMapStore()

  // 合并归一（路线 X）：/dispatch 已退化为 redirect → /map，route.path 恒为 /map，
  // 不能再按 path 切实例；改按共享态派生 variant 选择激活 map：调派态用 dispatch 实例。
  const currentMap = computed(() =>
    isDispatchVariant() ? dispatchMapStore.map : mapStore.map,
  )

  return { currentMap }
}
