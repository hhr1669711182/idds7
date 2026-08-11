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
import { createFireSprite } from "./generateFireSprite.js";
import { createBuildingByFloors } from "./createBuildingByFloors.js";
import { commonSetting, getDispatchData } from "./commonSetting.js";

let scene, camera, renderer, controls, buildingsGroup;
let fireTruck = undefined;
let isMicroRegion = true;
let mixer;
let fireFloor = 0;

async function attachEnvBuildings(group) {
  try {
    const features = await loadEnvBuildings();
    createExtrudedBuildings(features, group, { color: 0xe8eef7, opacity: 0.7 });
  } catch (e) {
    console.warn("[building3d] load failed", e);
  }
}

export const initThree = async (container, allFloors, dispatchStore, isRegion = true) => {
  if (renderer) return;

  isMicroRegion = isRegion;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeaf3ff);
  camera = new THREE.PerspectiveCamera(
    60,
    container.value.clientWidth / container.value.clientHeight,
    0.1,
    1000,
  );

  let pos = [3, 6, 9];
  if (!isMicroRegion) pos = [0.5, 2.0, 2.0];
  camera.position.set(pos[0], pos[1], pos[2]);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
  container.value.appendChild(renderer.domElement);

  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1, 0.2);
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
  getDispatchData(dispatchStore);
  const dataZH = await loadBuildingData();
  loadFireHydrant(buildingsGroup, isMicroRegion);
  createFireSprite(buildingsGroup, dataZH, fireFloor);

  for (const item of commonSetting.truckFullPath) {
    let coor = item[0];
    if (!isMicroRegion) coor = item[item.length - 1];
    fireTruck = await loadFireTruck(buildingsGroup, coor);
    if (isMicroRegion) drawTruckPath(buildingsGroup, item);
  }

  if (isMicroRegion) {
    createWhiteBuildings(buildingsGroup, dataZH);
  }
  await createBuildingByFloors(buildingsGroup, allFloors, dataZH, isMicroRegion);
  await attachEnvBuildings(buildingsGroup);
};

export const animateRefresh = (clockChange) => {
  if (mixer) mixer.update(clockChange);
  if (isMicroRegion) moveFireTruckAlongPath(camera, fireTruck, clockChange);
  controls.update();
  renderer.render(scene, camera);
};

export const windowResize = (container) => {
  camera.aspect = container.value.clientWidth / container.value.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.value.clientWidth, container.value.clientHeight);
};

export const disposeResource = (container) => {
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer = null;
    scene.clear();
    buildingsGroup.clear();
    container.value?.removeChild(renderer.domElement);
  }
};

export function drawPointMarker(event) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  console.log("intersects", intersects);
  console.log("fireFloor", fireFloor);
}