/*
 * @Author: huanghuanrong
 * @Date: 2026-04-07 19:16:10
 * @LastEditTime: 2026-05-11 14:19:54
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\public\publicLink.js
 */
const isCross = false
const location = !isCross ? window.location.origin : 'http://192.168.172.115:5173';

export const publicLink =  {
    d25: location + "/ThreejsViewerRegion",
    d3: location + "/ThreejsViewerBuilding",
   }
