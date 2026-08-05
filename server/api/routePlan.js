/*
 * @Author: huanghuanrong
 * @Date: 2026-05-08 18:03:40
 * @LastEditTime: 2026-05-15 14:16:25
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\server\api\routePlan.js
 */
export const routePlanRequestPayload = {
  eventKey: 'route.plan.request',
  data: {
    alarmId: 'INC20260423001',
    transportMode: 'driving',
    carType: '11',
    alarmData: {
      targetId: 'target_001',
      // gisX: 113.5298,
      // gisY: 22.2762,
      gisX: 113.54581672,
      gisY: 22.22169833,
      "buildId": "688B9A3F38EA48E6AECD87AB911092A1",
      "info": {
        "id": "JR-004",
        "address": "西海名苑",
        "status": "接警",
        "alarmTime": new Date().toISOString(),
        "alarmType": "办公楼电气火警",
        "burningMaterial": "插排及办公耗材",
        "keyUnit": "西海名苑",
        "district": "珠海市香洲区",
        "street": "拱北街道",
        "description": "办公楼茶水间插排短路，现场正在排烟和断电检查。"
      }
    },
    fireBrigade: [
      {
        id: 'fire_truck_001',
        "orgName": "珠海市香洲区前山消防队",
        "orgType": "fire_truck",
        "gisX": 113.504055,
        "gisY": 22.24067,
        info: {},
        attrs: {
          vehicles: [
            {
              id: 'ambulance_002',
              carName: '珠海消防中队云梯消防车',
              carType: 'ambulance',
              gisX: 113.528,
              gisY: 22.3218,
              info: {},
            },
          ],
        },
      },
      // {
      //   id: 'ambulance_002',
      //   orgName: '珠海消防中队',
      //   orgType: 'ambulance',
      //   gisX: 113.5083,
      //   gisY: 22.2581,
      //   info: {},
      // },
      // {
      //   id: 'ambulance_003',
      //   orgName: '珠海消防救援站',
      //   orgType: 'ambulance',
      //   gisX: 113.5713,
      //   gisY: 22.2697,
      //   info: {},
      // },
    ],
  },
}

export const createRoutePlanRequestPayload = () => ({
  ...routePlanRequestPayload,
  timestamp: new Date().toISOString(),
})

export const routePlanApi = {
  'GET /api/route-plan-request': () => createRoutePlanRequestPayload(),
  'GET /api/health': () => ({
    ok: true,
    service: 'ids-gis-web mock websocket server',
    timestamp: new Date().toISOString(),
  }),
}
