/*
 * @Author: hhr
 * @Date: 2026-06-16 10:26:42
 * @LastEditTime: 2026-11-03 17:45:00
 * @LastEditors: hhr
 * @Description: 当前地图实例访问。
 *               路线 Y B-6c：单实例常驻后不再有独立调派 map，统一返回主 mapStore.map。
 * @FilePath: \ids-gis-web\src\composables\useCurrentMap.ts
 */
import { computed } from 'vue'
import { useMapStore } from '@/store'

export const useCurrentMap = () => {
  const mapStore = useMapStore()

  // 路线 Y B-6c：调派业务态由主 map 内纠缠体承载，不再有第二 map 实例。
  const currentMap = computed(() => mapStore.map)

  return { currentMap }
}
