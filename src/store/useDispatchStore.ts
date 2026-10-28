/*
 * @Author: hhr
 * @Date: 2026-04-19 15:09:41
 * @LastEditTime: 2026-07-01 10:31:08
 * @LastEditors: hhr
 * @Description: 文件描述s
 * @FilePath: \ids-gis-web\src\store\useDispatchStore.ts
 */
import { defineStore } from 'pinia'
import { reactive, toRefs } from 'vue'

export const useDispatchStore = defineStore(
  'dispatchStore',
  () => {
    const state = reactive({
      dispatch: {
        fireBrigade: [
          {
            gisX: 114.314521,
            gisY: 22.543021,
            name: '消防支队',
            info: {
              name: '消防支队',
              address: '北京市海淀区',
              phone: '13800000000',
            },
            status: '待调',
            type: '消防支队',
          },
        ],
      },
      alarmData: {
        gisX: null as number | null,
        gisY: null as number | null,
        info: {} as Record<string, unknown>,
        buildId: null as string | null,
      },
      navPathPlanData: {} as Record<string, { fullPath: any[]; tmcs: any[] }[]>,
    })

    const setDispatch = (d: Partial<typeof state>) => {
      Object.assign(state, d)
    }

    return {
      ...toRefs(state),
      setDispatch,
    }
  },
  {
    persist: {
      storage: localStorage,
    },
  },
)
