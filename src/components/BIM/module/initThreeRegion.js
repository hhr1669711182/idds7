import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createWhiteBuildings, loadBuildingData } from "./createWhiteBuildings.js";
import { loadEnvBuildings, createExtrudedBuildings } from "../building3d.js";
import { load3DBuilding } from "./createBIMBuilding.js";
import {
  loadFireFighter,
  loadFireTruck,
  loadFireHydrant,
} from "./createFireFacilities.js";
import {
  drawTruckPath,
  moveFireTruckAlongPath,
} from "./drawTruckPath.js";
import { createFireSprite, updateFireSpriteFloor, updateFireSpriteSmoke, createTrappedPerson, updateTrappedPerson } from "./generateFireSprite.js";
import { createBuildingByFloors, updateFireFloor } from "./createBuildingByFloors.js";
import { commonSetting, getDispatchData, updateBIMType, getMessageData } from "./commonSetting.js";
import { drawAOIPath, loadAroundData } from "./createAroundFacilities.js";

let scene, camera, renderer, controls, buildingsGroup;
let fireTruck = undefined;
let isMicroRegion = true;
let mixer;
let fireFloor = 0


async function attachEnvBuildings(group) {
  try {
    const features = await loadEnvBuildings();
    createExtrudedBuildings(features, group, { color: 0xe8eef7, opacity: 0.7 });
  } catch (e) {
    console.warn("[building3d] load failed", e);
  }
}
let needleBox

export const initThree = async (container, allFloors, dispatchStore, route, data = undefined) => {
  if(renderer){   
    return
  } 

  isMicroRegion = true;
  // 创建场景
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202555); //0xf0f8ff
  // 创建相机（透视相机，适配园区尺度）
  camera = new THREE.PerspectiveCamera(
    60,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    1000,
  );

  let pos = [2.5, 2.5, 2.5];
  if (!isMicroRegion) pos = [0.5, 2.0, 2.0];
  camera.position.set(pos[0], pos[1], pos[2]); // 俯瞰视角
  // 创建渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  container.value.appendChild(renderer.domElement);

  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;

  // 轨道控制器（鼠标交互）
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const compassEl = document.getElementById('resetNorthBtn');
  needleBox = document.getElementById('needleBox');
  compassEl.addEventListener('click', () => {
    controls.reset();
    camera.position.set(pos[0], pos[1], pos[2]);
    //camera.lookAt(0, 0, 0);
    controls.update();
  });

  // 灯光（让白模有光影层次）
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); //0xffffff
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 10.2); //0xffffff

  dirLight.position.set(50, 500, 10);
  dirLight.castShadow = true;
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
  fillLight.position.set(-100, 50, -100);
  scene.add(fillLight);

  buildingsGroup = new THREE.Group();
  scene.add(buildingsGroup);
  await loadData(allFloors, dispatchStore, route);
};

export const updateThree = async (allFloors, dispatchStore, route, data = undefined) => {
  await updateAllData(allFloors, dispatchStore, route, data);

}

function updateCompass() {
  // 获取相机绕Y轴的水平旋转角度（方位角）
  const euler = new THREE.Euler();
  euler.setFromQuaternion(camera.quaternion, 'YXZ');
  // 转为角度，让指针跟随相机朝向转动
  const rotateDeg = THREE.MathUtils.radToDeg(euler.y);
  needleBox.style.transform = `rotate(${-rotateDeg}deg)`;
}

const updateAllData = async (allFloors, dispatchStore, route, data) => {
  let dataTest = [
    {
      baseLon: 113.93499,
      baseLat: 22.54678,
      buildingId: "bld8147cdcc0891edb6e86605eed6",
    },
    {
      baseLon: 113.93481,
      baseLat: 22.54756,
      buildingId: "bld2b83f576b5ff0cbb62cb67b9bb",
    },
  ];
  getMessageData(dataTest[data])
  //getDispatchData(dispatchStore)
  //if(!commonSetting.needUpdate) return
  //buildingsGroup.clear();
  clearGroup(buildingsGroup)

  const dataZH = await loadBuildingData(undefined)
  //if (isMicroRegion) load3DBuilding(buildingsGroup);
  loadFireHydrant(buildingsGroup, isMicroRegion);
  createFireSprite(buildingsGroup, dataZH, fireFloor);
  drawAOIPath(buildingsGroup, dataZH.aoiBuilding)
  if(!(route.meta.query && route.meta.query == "inquiryBuilding"))
    for(const item of commonSetting.truckFullPath) {
      let coor = item[0];
      if (!isMicroRegion) coor = item[item.length -1];
      fireTruck = await loadFireTruck(buildingsGroup, coor);
      if (isMicroRegion) drawTruckPath(buildingsGroup, item);
    };
 
  //mixer = await loadFireFighter(buildingsGroup);
  if (isMicroRegion) {   
    createWhiteBuildings(buildingsGroup, dataZH);
  }
  await createBuildingByFloors(buildingsGroup, allFloors, dataZH, isMicroRegion);
  await attachEnvBuildings(buildingsGroup);
  loadAroundData(buildingsGroup)
  await createTrappedPerson(buildingsGroup, dataZH, fireFloor)

}

export const updateData = (data, type) => {
  if (type == updateBIMType.fireFloor) {
    updateFireSpriteFloor(data.value.floor)
  } else if (type == updateBIMType.smokeSize) {
    updateFireSpriteSmoke(data.value.smoke, data.value.floor)
  } else if (type == updateBIMType.trappedPerson) {
    updateTrappedPerson(data.value.trapped, data.value.floor)
  }
}

const loadData = async (allFloors, dispatchStore, route) => {  
  const dataZH = await loadBuildingData(undefined)
  //if (isMicroRegion) load3DBuilding(buildingsGroup);
  loadFireHydrant(buildingsGroup, isMicroRegion);
  createFireSprite(buildingsGroup, dataZH, fireFloor);
  drawAOIPath(buildingsGroup, dataZH.aoiBuilding)
  if(!(route.meta.query && route.meta.query == "inquiryBuilding"))
    for(const item of commonSetting.truckFullPath) {
      let coor = item[0];
      if (!isMicroRegion) coor = item[item.length -1];
      fireTruck = await loadFireTruck(buildingsGroup, coor);
      if (isMicroRegion) drawTruckPath(buildingsGroup, item);
    };
 
  //mixer = await loadFireFighter(buildingsGroup);
  if (isMicroRegion) {   
    createWhiteBuildings(buildingsGroup, dataZH);
  }
  await createBuildingByFloors(buildingsGroup, allFloors, dataZH, isMicroRegion);
  await attachEnvBuildings(buildingsGroup);
  loadAroundData(buildingsGroup)
  await createTrappedPerson(buildingsGroup, dataZH, fireFloor)
  //isPointInPolygon(113.54581672, 22.22169833);
  //isPointInPolygon(113.38715, 22.37640)
};

export const updateFireBuilding = (floor, allFloors) => {
  updateFireFloor(floor, allFloors)
}

export const animateRefresh = (clockChange) => {
  if (mixer) {
    mixer.update(clockChange);
  }
  if (isMicroRegion) moveFireTruckAlongPath(camera, fireTruck, clockChange);
  controls.update(); // 平滑更新控制器
  updateCompass()  
  renderer.render(scene, camera);
};

export const windowResize = (container) => {
  camera.aspect = container.value.clientWidth / container.value.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
};

/**
 * 递归清空Group，并彻底释放几何体、材质、纹理所有GPU显存资源，防止内存泄漏
 * @param {THREE.Group | THREE.Scene | THREE.Mesh} obj 需要销毁的对象
 */
function disposeObject(obj) {
    // 1. 遍历当前对象所有子元素，递归处理
    while (obj.children.length > 0) {
        const child = obj.children[0];
        disposeObject(child);
        obj.remove(child);
    }

    // 2. 如果是网格模型，释放几何体、材质、贴图
    if (obj.isMesh) {
        // 释放几何体
        if (obj.geometry) {
            obj.geometry.dispose();
        }

        // 处理多材质 / 单材质
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        materials.forEach(mat => {
            if (!mat) return;
            // 释放材质
            mat.dispose();

            // 遍历材质内所有贴图并释放
            Object.values(mat).forEach(val => {
                if (val?.isTexture) {
                    val.dispose();
                }
            });

            // 处理材质贴图数组（如法线贴图、粗糙度贴图等）
            const textureKeys = [
                'map', 'normalMap', 'roughnessMap', 'metalnessMap',
                'aoMap', 'displacementMap', 'alphaMap', 'emissiveMap'
            ];
            textureKeys.forEach(key => {
                const tex = mat[key];
                if (tex?.isTexture) {
                    tex.dispose();
                }
            });
        });
    }

    // 3. 灯光、线条等其他类型资源可按需扩展释放
    if (obj.isLight) {
        obj.dispose?.();
    }
}

/**
 * 安全清空Group：先递归释放资源，再清空子元素
 * @param {THREE.Group} group
 * @param {THREE.Scene?} scene 可选：如果需要同时从场景移除该Group可传入
 */
function clearGroup(group, scene = null) {
    if (!group) return;

    // 递归释放所有子资源
    disposeObject(group);

    // 从场景中移除当前Group
    if (scene && group.parent === scene) {
        scene.remove(group);
    }

    // 此时 group.children 已为空，等同于 group.clear()
}

export const disposeResource = (container) => {
  if(renderer) {
    renderer.dispose();
    renderer.forceContextLoss()
    renderer = null
    scene.clear();
    clearGroup(buildingsGroup)
    container.value?.removeChild(renderer.domElement);
  } 
};

async function isPointInPolygon(lon, lat) {
  const postBody = `
    <wfs:GetFeature 
    service="WFS" 
    version="1.0.0" 
    outputFormat="json"
    xmlns:wfs="http://www.opengis.net/wfs"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:gml="http://www.opengis.net/gml">
    <wfs:Query typeName="gis:view_juris_zone">
        <ogc:Filter>
        <ogc:Intersects>
            <ogc:PropertyName>zone_geom</ogc:PropertyName>
            <gml:Point srsName="EPSG:4326">
            <gml:coordinates>${lon},${lat}</gml:coordinates>
            </gml:Point>
        </ogc:Intersects>
        </ogc:Filter>
    </wfs:Query>
    </wfs:GetFeature>`;

  try {
    const res = await fetch("geoserver/gis/ows", {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: postBody,
    });

    const data = await res.json();  
    const inside = data.features && data.features.length > 0;
    console.log("点是否在面内：", inside);
    if(inside) console.log(data.features);
    return inside;
  } catch (err) {
    console.error("查询失败：", err);
    return false;
  }
}

