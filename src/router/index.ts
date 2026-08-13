/*
 * @Author: huanghuanrong
 * @Date: 2026-05-09 13:54:25
 * @LastEditTime: 2026-06-23 16:19:24
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\router\index.ts
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import type { App } from 'vue'
import MainLayout from '@/layout/MainLayout.vue'
import ThreejsViewerRegion from '@/views/region.vue'
import ThreejsViewerBuilding from '@/views/building.vue'
import { setupRouterGuard } from './guard'
import { unregisterDynamicRoutes } from './dynamic'
import { ROUTE_NAMES } from './constants'

export const staticRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    name: ROUTE_NAMES.ROOT,
    redirect: '/map',
    component: MainLayout,
    children: [
      {
        path: 'map',
        name: ROUTE_NAMES.MAP,
        component: () => import('@/views/home.vue'),
        meta: {
          title: '地图',
        },
      },
      {
        path: 'test',
        name: ROUTE_NAMES.TEST,
        component: () => import('@/views/test/index.vue'),
        meta: {
          title: '测试',
        },
      },
      {
        path: 'ThreejsViewerRegion',
        name: ROUTE_NAMES.THREE_REGION,
        component: ThreejsViewerRegion,
        meta: {
          title: '区域三维',
        },
      },
      {
        path: 'ThreejsViewerBuilding',
        name: ROUTE_NAMES.THREE_BUILDING,
        component: ThreejsViewerBuilding,
        meta: {
          title: '建筑三维',
        },
      },
      // {
      //   path: 'viewerInquiryBuilding',
      //   name: ROUTE_NAMES.VIEWER_INQUIRY_BUILDING,
      //   component: () => import('@/components/BIM/viewerInquiryBuilding.vue'),
      //   meta: {
      //     title: '模型',
      //   },
      // },
    ],
  },
  {
    path: '/modelAssess',
    name: ROUTE_NAMES.MODEL_ASSESS,
    component: () => import('@/views/modelAssess/index.vue'),
    meta: {
      title: '模型研判',
    },
  },
  {
    path: '/dispatch',
    name: ROUTE_NAMES.DISPATCH,
    component: () => import('@/views/dispatch/index.vue'),
    meta: {
      title: '调派页面',
    },
  },
  {
    path: '/viewerInquiryBuilding',
    name: ROUTE_NAMES.VIEWER_INQUIRY_BUILDING,
    component: () => import('@/components/BIM/viewerInquiryBuilding.vue'),
    meta: {
      title: '模型',
    },
  },
  {
    path: '/ThreejsViewerRegion',
    name: ROUTE_NAMES.VIEWER_MICRO_REGION,
    component: () => import('@/components/BIM/ThreejsViewerRegion.vue'),
    meta: {
      title: '微区域',
      query: 'inquiryBuilding',
    },
  },
  {
    path: '/CesiumDuty',
    name: ROUTE_NAMES.VIEWER_DUTY,
    component: () => import('@/components/BIM/CesiumDuty.vue'),
    meta: {
      title: '值守',
      //query: 'inquiryBuilding',
    },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/map',
  },

]

const staticRouteNames = new Set(
  staticRoutes
    .flatMap((route) => [route, ...(route.children ?? [])])
    .map((route) => route.name)
    .filter(Boolean),
)

const router = createRouter({
  history: createWebHashHistory(),
  routes: staticRoutes,
})

setupRouterGuard(router)

export const resetRouter = (): void => {
  unregisterDynamicRoutes()

  router.getRoutes().forEach((route) => {
    const { name } = route
    if (name && !staticRouteNames.has(name)) {
      router.hasRoute(name) && router.removeRoute(name)
    }
  })
}

export const setupRouter = (app: App<Element>) => {
  app.use(router)
}

export default router
