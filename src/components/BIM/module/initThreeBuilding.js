import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createWhiteBuildings, loadBuildingData } from "./createWhiteBuildings.js";
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
import { createFireSprite } from "./generateFireSprite.js";
import { createBuildingByFloors } from "./createBuildingByFloors.js";
import { commonSetting, getDispatchData } from "./commonSetting.js";

let scene, camera, renderer, controls, buildingsGroup;
let fireTruck = undefined;
let isMicroRegion = true;
let mixer;
let fireFloor = 0

export const initThree = async (container, allFloors, dispatchStore, isRegion = true) => {
  if(renderer) return

  isMicroRegion = isRegion;
  // 创建场景
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeaf3ff); //0xf0f8ff
  // 创建相机（透视相机，适配园区尺度）
  camera = new THREE.PerspectiveCamera(
    60,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    1000,
  );

  let pos = [3, 6, 9];
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
  await loadData(allFloors, dispatchStore);
};

const loadData = async (allFloors, dispatchStore) => {
  getDispatchData(dispatchStore)
  const dataZH = await loadBuildingData()
  //if (isMicroRegion) load3DBuilding(buildingsGroup);
  loadFireHydrant(buildingsGroup, isMicroRegion);
  createFireSprite(buildingsGroup, dataZH, fireFloor);

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
  
  //isPointInPolygon(113.54581672, 22.22169833);
  //isPointInPolygon(113.38715, 22.37640)
};

export const animateRefresh = (clockChange) => {
  if (mixer) {
    mixer.update(clockChange);
  }
  if (isMicroRegion) moveFireTruckAlongPath(camera, fireTruck, clockChange);
  controls.update(); // 平滑更新控制器
  renderer.render(scene, camera);
};

export const windowResize = (container) => {
  camera.aspect = container.value.clientWidth / container.value.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
};

export const disposeResource = (container) => {
  if(renderer) {
    renderer.dispose();
    renderer.forceContextLoss()
    renderer = null
    scene.clear();
    buildingsGroup.clear();
    container.value?.removeChild(renderer.domElement);
  } 
};

export function drawPointMarker() {
  let raycaster = new THREE.Raycaster();
  let mouse = new THREE.Vector2(); 
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  if (intersects.length > 0) {  
    const clickWorldPos = intersects[0].point;
    console.log("hello", clickWorldPos, intersects);   
    createPointMarker(clickWorldPos);
  }
}

function createPointMarker(pos) {
  const geo = new THREE.SphereGeometry(0.02, 16, 16);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff3333,
    transparent: true,
    opacity: 0.8,
  });
  const marker = new THREE.Mesh(geo, mat);
  marker.position.copy(pos);
  scene.add(marker);
}
