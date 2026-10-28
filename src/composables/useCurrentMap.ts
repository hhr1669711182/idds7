/*
 * @Author: hhr
 * @Date: 2026-06-16 10:26:42
 * @LastEditTime: 2026-06-17 10:44:45
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\composables\useCurrentMap.ts
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMapStore } from '@/store'
import { useDispatchMapStore } from '@/store/useDispatchMapStore'
import { useDispatch1MapStore } from '@/store/useDispatch1MapStore'

export const useCurrentMap = () => {
  const route = useRoute()
  const mapStore = useMapStore()
  const dispatchMapStore = useDispatchMapStore()
  const dispatch1MapStore = useDispatch1MapStore()

  const currentMap = computed(() => {
    const path = route?.path || window.location.hash
    // 先判断 /dispatch1，再判断 /dispatch，否则 /dispatch1 会被 /dispatch 分支误命中
    if (path.includes('/dispatch1')) {
      return dispatch1MapStore.map
    }
    if (path.includes('/dispatch')) {
      return dispatchMapStore.map
    }
    return mapStore.map
  })

  return { currentMap }
}
