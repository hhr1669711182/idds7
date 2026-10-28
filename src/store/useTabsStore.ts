/*
 * @Author: huanghuanrong
 * @Date: 2026-04-09 17:11:03
 * @LastEditTime: 2026-04-21 17:07:27
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\store\useTabsStore.ts
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'OPENLAYERS_ACTIVE_TAB'

const loadActiveTab = () => {
  const raw = localStorage.getItem(STORAGE_KEY)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * 底部 tab 切换状态（store 只管「当前选中 tab」，不负责导航）。
 * 路由跳转由调用方组件自行 router.push（避免 store 与 router 生命周期耦合）。
 */
export const useTabsStore = defineStore('tabsStore', () => {
  const activeTab = ref<number>(loadActiveTab() || 1)

  const setActiveTab = (tab: number) => {
    activeTab.value = tab
    localStorage.setItem(STORAGE_KEY, `${tab}`)
  }

  return {
    activeTab,
    setActiveTab,
  }
})
