export const backendRoutes = [
  {
    path: 'dynamic-region',
    name: 'DynamicRegion',
    component: 'region',
    meta: {
      title: '动态区域三维',
      requiresAuth: false,
    },
  },
  {
    path: 'dynamic-building',
    name: 'DynamicBuilding',
    component: 'building',
    meta: {
      title: '动态建筑三维',
      requiresAuth: false,
    },
  },
]

export const routesApi = {
  'GET /api/routes': () => ({
    data: backendRoutes,
  }),
}
