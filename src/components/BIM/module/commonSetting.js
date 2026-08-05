/*
 * @Author: huanghuanrong
 * @Date: 2026-05-12 18:35:02
 * @LastEditTime: 2026-05-26 16:35:41
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\BIM\module\commonSetting.js
 */
import * as turf from '@turf/turf'
import { CoordinateUtil } from './transformCoordinate'

export const commonSetting = {
  basePoint: { baseLon: 113.93499, baseLat: 22.54678 },
  disasterBuildingID: "bld8147cdcc0891edb6e86605eed6",
  // basePoint: { baseLon: 113.93481, baseLat: 22.54756 },
  // disasterBuildingID: "bld2b83f576b5ff0cbb62cb67b9bb",

  needUpdate: false,
  truckFullPath: [
    [
      [113.93638, 22.54585],
      [113.93578, 22.54565],
      [113.93546, 22.54562],
      [113.93549, 22.54599],
      [113.93547, 22.54632],
      [113.93524, 22.54663],
    ],
  ],

  geoServerUrl: "",
  searchRadius: 50,
  buildRadius: 200,
  gisWorkspace: "gis",

  fireHydrant: { layerName: "gis:env_fire_water", geom: "geom" },
  whiteBuilding: { layerName: "gis:view_env_building", geom: "geom" },
  aoiBuilding: { layerName: "gis:env_build_aoi", geom: "geom" },
  entranceExit: { layerName: "gis:env_entrance_exit", geom: "geom" },
  greatchinaRoad	: { layerName: "gis:env_greatchina_road", geom: "geom" },
  envEnterprises: { layerName: "gis:view_env_enterprises", geom: "geom" },

  wallAndFloor: {
    WALL_HEIGHT: 0.09,
    WALL_THICKNESS: 0.008,
    FLOOR_THICKNESS: 0.008,
  },
};

export const getMessageData = (data) => {  
  console.log("message data" , data)
  if(data.baseLon && data.baseLat || data.buildingId)
  {
    commonSetting.basePoint.baseLon = data.baseLon
    commonSetting.basePoint.baseLat = data.baseLat
    commonSetting.needUpdate = !(commonSetting.disasterBuildingID == data.buildingId)
    commonSetting.disasterBuildingID = data.buildingId
  }else{
    commonSetting.needUpdate = false
    console.log("传入的数据错误或者不完整！")
  } 
}

export const getDispatchData = (dispatchStore) => {
  console.log("dispatchStore" , dispatchStore)
  if(dispatchStore.alarmData.gisX && dispatchStore.alarmData.gisY && dispatchStore.alarmData.buildId)
  {
    commonSetting.basePoint.baseLon = dispatchStore.alarmData.gisX
    commonSetting.basePoint.baseLat = dispatchStore.alarmData.gisY
    commonSetting.needUpdate = !(commonSetting.disasterBuildingID == dispatchStore.alarmData.buildId)
    commonSetting.disasterBuildingID = dispatchStore.alarmData.buildId
  }else{
    commonSetting.needUpdate = false
    console.log("传入的数据错误或者不完整！")
  } 

  commonSetting.truckFullPath = []
  const navPathPlanData = dispatchStore.navPathPlanData
  if(!navPathPlanData || navPathPlanData.length == 0){
    console.log("车辆路径数据为空！")
    return
  } 
  
  for (const key in navPathPlanData) {
    let truckPath = []
    navPathPlanData[key].fullPath.forEach(item => {
      //truckPath.push(CoordinateUtil.gcj02Towgs84(item[0], item[1]))
      truckPath.push(item)
    })
    const path = calculatePath(truckPath)
    commonSetting.truckFullPath.push(path)
  }
};

export const updateBIMType = {
  fireFloor: "fireFloor",
  smokeSize: "smokeSize",
  trappedPerson: "trappedPerson",
}

const calculatePath = (fullPath) => {
  let idx = 0;
  const basePoint = [
    commonSetting.basePoint.baseLon,
    commonSetting.basePoint.baseLat,
  ];
  for (let i = 0; i < fullPath.length; i++) {
    const distance = turf.distance(basePoint, fullPath[i], { units: "meters" });
    if (distance < commonSetting.searchRadius) {
      idx = i;
      break;
    }
  }
  return fullPath.slice(idx);
};
