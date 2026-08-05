import * as THREE from "three";
import * as ClipperLib from "js-clipper";
import { lonLatToLocalCoord, loadGLTF } from "./commonThree.js";
import { commonSetting } from "./commonSetting.js";

const WALL_HEIGHT = commonSetting.wallAndFloor.WALL_HEIGHT;
const WALL_THICKNESS = commonSetting.wallAndFloor.WALL_THICKNESS;
const FLOOR_THICKNESS = commonSetting.wallAndFloor.FLOOR_THICKNESS;

export async function createBuildingByFloors(
  buildingsGroup,
  allFloors,
  dataZH,
  isMicroRegion,
) {  
  const coordinates = dataZH.disasterBuilding.geometry.coordinates[0]
  const floors = parseInt(dataZH.disasterBuilding.properties.met_upfloors)
  const points = [];
  coordinates.forEach(([lon, lat]) => {
    const localCoord = lonLatToLocalCoord(lon, lat);
    points.push(localCoord);
  });

  const groupFloor = new THREE.Group();
  for (let i = 0; i < floors; i++) {
    groupFloor.add(await createBuilding(allFloors, points, i));
  }
  const addH = floors * (FLOOR_THICKNESS + WALL_HEIGHT);
  const floor = createFloor(points, FLOOR_THICKNESS, addH);
  //增加楼顶
  if (isMicroRegion) groupFloor.add(floor);
  buildingsGroup.add(groupFloor);
}

async function createBuilding(allFloors, points, i) {
  const addH = i * (FLOOR_THICKNESS + WALL_HEIGHT);
  const group = new THREE.Group();
  const floor = createFloor(points, FLOOR_THICKNESS, addH);
  floor.userData = { name: "buildingFloor", height: i };
  const walls = createExtrudeWall(points, WALL_HEIGHT, WALL_THICKNESS, addH);
  walls.userData = { name: "extrudeWall", height: i }
  //const window = createWindowOnWall(0, addH);
  //const extinguisher = await loadExtinguisher(i);

  group.add(floor);
  group.add(walls);
  //group.add(window);
  //group.add(extinguisher);
  allFloors.push(group);
  return group;
}

export const updateFireFloor = (floor, allFloors) => {
  allFloors.forEach((item) => {
    item.children[1].material.color.set(0x00ff00);
  });

  if (floor + 1 < allFloors.length) {
    updateFloorColor(floor + 1, allFloors, 0xffff00);
  }
  updateFloorColor(floor, allFloors, 0xff0000);
  if (floor - 1 > -1) {
    updateFloorColor(floor - 1, allFloors, 0xffff00);
  }
};

const updateFloorColor = (floor, allFloors, color) => {
  allFloors[floor].children[1].material.color.set(color);
};

function createWindowOnWall(floorThickness, addH) {
  const coor = [
    [113.54601576, 22.22160904],
    [113.54583288, 22.22158393],
  ];
  let x1 = coor[0][0];
  let y1 = coor[0][1];
  let x2 = coor[1][0];
  let y2 = coor[1][1];
  let lenX = (x2 - x1) / 5.0;
  let lenY = (y2 - y1) / 5.0;
  const coordinates = [
    [x1 + lenX * 2, y1 + lenY * 2],
    [x1 + lenX * 3, y1 + lenY * 3],
  ];

  const points = [];
  coordinates.forEach(([lon, lat]) => {
    const localCoord = lonLatToLocalCoord(lon, lat);
    points.push(localCoord);
  });

  const halfWidth = 0.001;
  let start = points[0];
  let end = points[1];

  // 线段方向
  const dx = end.x - start.x;
  const dz = end.y - start.y;
  const len = Math.sqrt(dx * dx + dz * dz);

  // 垂直方向（向左/右扩宽）
  const perpX = (-dz / len) * halfWidth;
  const perpZ = (dx / len) * halfWidth;

  //
  const pointsNew = [];
  pointsNew.push(new THREE.Vector2(start.x + perpX, start.y + perpZ));
  pointsNew.push(new THREE.Vector2(start.x - perpX, start.y - perpZ));
  pointsNew.push(new THREE.Vector2(end.x - perpX, end.y - perpZ));
  pointsNew.push(new THREE.Vector2(end.x + perpX, end.y + perpZ));

  const outerShape = new THREE.Shape(pointsNew);
  // 3. 拉伸成 3D 墙体
  const geometry = new THREE.ExtrudeGeometry(outerShape, {
    depth: 0.05,
    bevelEnabled: false,
  });

  const material = new THREE.MeshLambertMaterial({
    color: 0xfeb23c,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(geometry, material);
  wall.rotation.x = -Math.PI / 2; // 平放
  wall.position.y = FLOOR_THICKNESS + addH + 0.035;
  return wall;
}

function createFloor(polygonPoints, floorThickness, addH) {
  const shape = new THREE.Shape(polygonPoints);
  //const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshLambertMaterial({
    color: 0x7f9ffe,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  });

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: floorThickness,
    bevelEnabled: false,
  });

  const floor = new THREE.Mesh(geometry, material);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = addH;
  return floor;
}

function createExtrudeWall(points, wallHeight, wallThickness, addH) {
  const outerShape = new THREE.Shape(points);

  const innerPoints = offsetPolygon(points, -wallThickness);
  const holePath = new THREE.Path(innerPoints);
  outerShape.holes = [holePath]; // 挖空 → 变成墙
  const geometry = new THREE.ExtrudeGeometry(outerShape, {
    depth: wallHeight,
    bevelEnabled: false,
  });

  const material = new THREE.MeshLambertMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(geometry, material);
  wall.rotation.x = -Math.PI / 2; // 平放
  wall.position.y = FLOOR_THICKNESS + addH;
  return wall;
}

function offsetPolygon(points, offsetDistance) {
  const SCALE = 1000;
  if (!points || points.length < 3) return points;
  if (Math.abs(offsetDistance) < 0.001) return points;

  const path = points.map((p) => ({
    X: Math.round(p.x * SCALE),
    Y: Math.round(p.y * SCALE),
  }));

  const offset = new ClipperLib.ClipperOffset();
  offset.AddPath(
    path,
    ClipperLib.JoinType.jtMiter,
    ClipperLib.EndType.etClosedPolygon,
  );

  const offsetPaths = new ClipperLib.Paths();
  offset.Execute(offsetPaths, offsetDistance * SCALE);

  if (!offsetPaths || offsetPaths.length === 0) {
    console.log("hello error");
    return [...points];
  }

  return offsetPaths[0].map((p) => new THREE.Vector2(p.X / SCALE, p.Y / SCALE));
}

async function loadExtinguisher(floor) {
  const addH = floor * (FLOOR_THICKNESS + WALL_HEIGHT);
  const gltf = await loadGLTF("/model3d/xf_extinguisher.glb");
  const model = gltf.scene;
  // model.scale.setScalar(0.0002);
  model.scale.set(0.00025, 0.0002, 0.00025); // 缩放模型（根据实际大小调整）
  model.position.set(-0.95, addH, -0.55); // 模型居中
  return model;
}
