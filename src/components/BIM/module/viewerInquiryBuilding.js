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
import { createFireSprite, updateFireSpriteFloor, updateFireSpriteSmoke, createTrappedPerson, updateTrappedPerson, loadTrappedPerson } from "./generateFireSprite.js";
import { createBuildingByFloors } from "./createBuildingByFloors.js";
import { commonSetting, getDispatchData, updateBIMType } from "./commonSetting.js";

let scene, camera, renderer, controls, buildingsGroup;
let fireTruck = undefined;
let isMicroRegion = false;
let mixer;
let fireFloor = 0

export const initThree = async (container, allFloors, dispatchStore, isRegion = true) => {
  if (renderer) return

  isMicroRegion = isRegion;
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

  let pos = [0.5, 4.0, 3.0];
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

export const loadData = async (allFloors, d) => {
  //getDispatchData(dispatchStore)
  const dataZH = await loadBuildingData({ ...d, layer: 'gis:mapBuilding' })
  // const dataZH = await loadBuildingData()
  loadFireHydrant(buildingsGroup, isMicroRegion, { ...d, layer: 'gis:v_srvc_water_hydrant' });
  createFireSprite(buildingsGroup, dataZH, fireFloor);

  //mixer = await loadFireFighter(buildingsGroup);
  await createBuildingByFloors(buildingsGroup, allFloors, dataZH, isMicroRegion);
  await createTrappedPerson(buildingsGroup, dataZH, fireFloor)

  //isPointInPolygon(113.54581672, 22.22169833);
  //isPointInPolygon(113.38715, 22.37640)
};

export const updateData = (data, type) => {
  if (type == updateBIMType.fireFloor) {
    updateFireSpriteFloor(data.value.floor)
  } else if (type == updateBIMType.smokeSize) {
    updateFireSpriteSmoke(data.value.smoke, data.value.floor)
  } else if (type == updateBIMType.trappedPerson) {
    updateTrappedPerson(data.value.trapped, data.value.floor)
  }
}

export const animateRefresh = (clockChange) => {
  if (mixer) {
    mixer.update(clockChange);
  }
  if (isMicroRegion) moveFireTruckAlongPath(camera, fireTruck, clockChange);
  controls?.update(); // 平滑更新控制器
  renderer?.render(scene, camera);
};

export const windowResize = (container) => {
  camera.aspect = container.value.clientWidth / container.value.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
};

export const disposeResource = (container) => {
  // if (renderer) {
  //   renderer.dispose();
  //   renderer.forceContextLoss()
  //   renderer = null
  //   scene.clear();
  //   buildingsGroup.clear();
  //   container.value?.removeChild(renderer.domElement);
  // }

  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    const domElement = renderer.domElement;
    renderer = null;
    if (scene) scene.clear();
    if (buildingsGroup) buildingsGroup.clear();
    if (container && container.value && domElement.parentNode === container.value) {
      container.value.removeChild(domElement);
    }
  }
};

export const clearBuildGroup = () => {
  if (buildingsGroup) buildingsGroup.clear();
}

export async function drawPointMarker(event, formData) {
  let raycaster = new THREE.Raycaster();
  let mouse = new THREE.Vector2();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  if (intersects.length == 0) return

  for (let i = 0; i < intersects.length; i++) {
    let item = intersects[i]
    if (item.object.userData.name === "buildingFloor" && item.object.userData.height == formData.value.floor - 1) {
      const clickWorldPos = item.point;
      console.log("hello", clickWorldPos);
      //createPointMarker(clickWorldPos);
      const trappedPerson = await loadTrappedPerson(clickWorldPos)
      buildingsGroup.add(trappedPerson);
      break
    }
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
