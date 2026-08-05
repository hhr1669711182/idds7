import * as THREE from "three";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { lonLatToLocalCoord } from "./commonThree.js";

let pathProgress = 0; // 行驶进度（0~1）
const speedTruck = 0.07; // 行驶速度
let movePath = undefined;

export function drawTruckPath(buildingsGroup, coordinates) {
  const shapePoints = [];
  coordinates.forEach(([lon, lat]) => {
    const localCoord = lonLatToLocalCoord(lon, lat, true);
    shapePoints.push(localCoord);
  });
  movePath = createSimplePath(shapePoints);
  createPath(buildingsGroup, shapePoints);
}

function createSimplePath(pathPoints) {
  const geometry = new THREE.BufferGeometry().setFromPoints(pathPoints);
  const material = new THREE.LineBasicMaterial({
    color: 0xff0000,
    linewidth: 1,
    transparent: true,
    opacity: 0.6,
  });
  return new THREE.Line(geometry, material);
}

function createPath(buildingsGroup, pathPoints, color = 0x00ff00) {
  // 把点拆成 xyz 数组
  const positions = [];
  pathPoints.forEach((p) => positions.push(p.x, p.y, p.z));
  // 官方宽线几何体
  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({
    color: color,
    linewidth: 6, // 🔥 这里可以调大！5、8、10、15 都可以
    transparent: true,
    opacity: 1,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight), // 必须加
  });

  const line = new Line2(geometry, material);
  buildingsGroup.add(line);
}

export function moveFireTruckAlongPath(camera, fireTruck, clockChange) {
  if (!fireTruck || !movePath) return;

  pathProgress += speedTruck * clockChange;
  //if (pathProgress > 1) pathProgress = 0 // 循环
  if (pathProgress > 1) return;

  const currentPoint = getPointAtLine(movePath, pathProgress);
  const nextPoint = getPointAtLine(movePath, (pathProgress + 0.01) % 1);

  fireTruck.position.copy(currentPoint);
  fireTruck.lookAt(nextPoint.x, currentPoint.y, nextPoint.z);
  fireTruck.rotation.y += -Math.PI / 2;

  const cameraOffset = new THREE.Vector3(2.5, 2.5, 2.5);
  const targetCameraPos = fireTruck.position.clone().add(cameraOffset);
  camera.position.lerp(targetCameraPos, 0.1);
  camera.lookAt(fireTruck.position);
}

function getPointAtLine(line, t) {
  const points = line.geometry.attributes.position.array;
  const vecs = [];
  for (let i = 0; i < points.length; i += 3) {
    vecs.push(new THREE.Vector3(points[i], points[i + 1], points[i + 2]));
  }

  let totalLen = 0;
  const lens = [0];
  for (let i = 1; i < vecs.length; i++) {
    totalLen += vecs[i].distanceTo(vecs[i - 1]);
    lens.push(totalLen);
  }

  const targetLen = t * totalLen;
  for (let i = 1; i < lens.length; i++) {
    if (lens[i] >= targetLen) {
      const p1 = vecs[i - 1];
      const p2 = vecs[i];
      const l1 = lens[i - 1];
      const l2 = lens[i];
      const k = (targetLen - l1) / (l2 - l1);
      const p = p1.clone().lerp(p2, k);
      return p;
    }
  }
  return vecs[0].clone();
}
