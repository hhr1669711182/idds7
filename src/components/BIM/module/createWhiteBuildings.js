/*
 * @Author: huanghuanrong
 * @Date: 2026-04-27 18:06:31
 * @LastEditTime: 2026-05-26 15:56:09
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\components\BIM\module\createWhiteBuildings.js
 */
import * as THREE from "three";
import { lonLatToLocalCoord } from "./commonThree.js";
import { commonSetting } from "./commonSetting.js";
//import { dataZH } from "@/data/buildDemo.js";

export const createWhiteBuildings = async (buildingsGroup, dataZH) => { 
  const whiteMaterial = new THREE.MeshLambertMaterial({
    color: 0xf5f5f5, //0xffffff
    //roughness: 0.6,         // 粗糙度（不要太高）
    //metalness: 0.0 ,         // 白模不要金属感
    transparent: true,
    opacity: 0.35,
  });

  dataZH.whiteBuilding.forEach((feature) => {
    const buildGuid = feature.properties.building_id;
    const name = feature.properties.short_name;
    const height = feature.properties.met_upfloors / 10.0;
    const coordinates = feature.geometry.coordinates[0]; // 提取Polygon轮廓   

    const shapePoints = [];
    coordinates.forEach(([lon, lat]) => {
      const localCoord = lonLatToLocalCoord(lon, lat);
      shapePoints.push(localCoord);
    });

    const shape = new THREE.Shape(shapePoints);
    const extrudeSettings = {
      depth: height, // 拉伸高度（建筑高度）
      bevelEnabled: false, // 无倒角，白模更简洁
    };
    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.computeBoundingBox();

    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    const buildingMesh = new THREE.Mesh(geometry, whiteMaterial);
    buildingMesh.castShadow = true;
    buildingMesh.receiveShadow = true;
    // 调整轴：Three.js中y轴为垂直方向，旋转几何体让轮廓在x/z平面
    buildingMesh.rotation.x = -Math.PI / 2;
    // 绑定建筑信息（用于点击交互）
    buildingMesh.userData = { name, height };
    buildingsGroup.add(buildingMesh);
  });
};

export const loadBuildingData = async (op) => {
  const lon = op?.lon ?? commonSetting.basePoint.baseLon 
  const lat = op?.lat ?? commonSetting.basePoint.baseLat

  const buildGuid = op?.buildId ?? commonSetting.disasterBuildingID
  const radius = commonSetting.searchRadius
  const url = commonSetting.geoServerUrl
  const ws = commonSetting.gisWorkspace
  const layerName = op?.layer ?? commonSetting.whiteBuilding.layerName
  const geom = commonSetting.whiteBuilding.geom

  // if(!lon || !lat || !layerName) return

  const postBody = `
    <wfs:GetFeature service="WFS" version="1.0.0" outputFormat="json"
    xmlns:wfs="http://www.opengis.net/wfs"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:gml="http://www.opengis.net/gml">
    <wfs:Query typeName="${layerName}">
        <ogc:Filter>
        <ogc:DWithin>
            <ogc:PropertyName>${geom}</ogc:PropertyName>
            <gml:Point srsName="EPSG:4326">
                <gml:coordinates>${lon},${lat}</gml:coordinates>
            </gml:Point>
            <ogc:Distance units="meters">${radius}</ogc:Distance>
        </ogc:DWithin>
        </ogc:Filter>
    </wfs:Query>
    </wfs:GetFeature>`;

  const res = await fetch(`geoserver/${ws}/ows`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: postBody,
  });
  const data = await res.json();
  const whiteBuilding = data.features.filter( item => item.properties.building_id != buildGuid) 
  const disasterBuilding = data.features.find( item => item.properties.building_id === buildGuid) 
  console.log("disasterBuilding ", disasterBuilding)
  let aoiBuilding
  if(disasterBuilding){
    aoiBuilding = await loadAOIData(disasterBuilding.properties.aoi_id)
  }
  return { whiteBuilding, disasterBuilding, aoiBuilding }
};

export const loadAOIData = async(id) => {
  if(!id) return undefined
  const layerName = commonSetting.aoiBuilding.layerName 
  const ws = commonSetting.gisWorkspace

  const postBody = `
    <wfs:GetFeature service="WFS" version="1.0.0" outputFormat="json"
    xmlns:wfs="http://www.opengis.net/wfs"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:gml="http://www.opengis.net/gml">
    <wfs:Query typeName="${layerName}">
        <ogc:Filter>
          <ogc:PropertyIsEqualTo>
            <ogc:PropertyName>aoi_id</ogc:PropertyName>
            <ogc:Literal>${id}</ogc:Literal>
          </ogc:PropertyIsEqualTo>
        </ogc:Filter>
    </wfs:Query>
    </wfs:GetFeature>`;

  const res = await fetch(`geoserver/${ws}/ows`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body: postBody,
  });
  const data = await res.json();
  
  if(!data.features || (data.features.length == 0)) return undefined
  const coordinates = data.features[0].geometry.coordinates[0]  
  return coordinates
}