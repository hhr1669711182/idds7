import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { commonSetting } from "./commonSetting.js";

export function lonLatToLocalCoord(lon, lat, isVector3 = false) {
  const baseLon = commonSetting.basePoint.baseLon;
  const baseLat = commonSetting.basePoint.baseLat;
  // 步骤2：经纬度转平面距离（米），简化计算（或用turf计算）
  const dx = (lon - baseLon) * 111319.9; // 经度每度≈111319.9米
  const dy = (lat - baseLat) * 111319.9; // 纬度每度≈111319.9米
  // 步骤3：缩放适配Three.js场景（缩小100倍，避免模型过大）
  if (isVector3) {
    return new THREE.Vector3(dx / 100, 0, -dy / 100);
  } else {
    return new THREE.Vector2(dx / 100, dy / 100);
  }
}

export function loadGLTF(url) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => resolve(gltf), // 成功时 resolve
      undefined, // 可选：进度回调（通常省略）
      (error) => reject(error), // 失败时 reject
    );
  });
}

export function loadOBJ(url) {
  return new Promise((resolve, reject) => {
    const loader = new OBJLoader();
    loader.load(
      url,
      (gltf) => resolve(gltf), // 成功时 resolve
      undefined, // 可选：进度回调（通常省略）
      (error) => reject(error), // 失败时 reject
    );
  });
}
