/*
 * @Author: huanghuanrong
 * @Date: 2026-04-07 19:16:10
 * @LastEditTime: 2026-04-08 09:37:51
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \OpenlayersMap\public\publicLink.js
 */
const isCross = true;
const location = !isCross ? window.location.origin : 'http://192.168.172.115:5173';

export const publicLink =  {
    d25: location + "/ThreejsViewerRegion",
    d3: location + "/ThreejsViewerBuilding",
   }
