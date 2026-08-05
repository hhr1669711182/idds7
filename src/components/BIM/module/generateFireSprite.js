import * as THREE from "three";
import * as turf from '@turf/turf'
import { lonLatToLocalCoord, loadGLTF } from "./commonThree.js";
import { commonSetting } from "./commonSetting.js";

let allGroup = undefined
let allData = undefined
let trappedPersonGroup = []
let fireScale = 0.3;
let smokeScale = 0.4;

export function createFireSprite(buildingsGroup, data, fireFloor) {
  allGroup = buildingsGroup
  allData = data
  const pos = getPosition(data, fireFloor)
  const textureLoader = new THREE.TextureLoader();
  const fireTex = textureLoader.load("/model3d/xf_smoke.png");
  const fireMat = new THREE.SpriteMaterial({
    map: fireTex,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    //  blending: THREE.NormalBlending,
    // depthWrite: true,
    color: new THREE.Color(0xff3300),
  });
  const fire = new THREE.Sprite(fireMat);
  fire.scale.set(fireScale, fireScale, fireScale);
  fire.position.copy(pos);
  fire.userData = { name: "fireSprite_fire" }
  buildingsGroup.add(fire);
  buildingsGroup.add(fire.clone());

  const smokeMat = new THREE.SpriteMaterial({
    map: fireTex,
    transparent: true,
    opacity: 0.8,
    blending: THREE.NormalBlending,
    depthWrite: false,
    color: new THREE.Color(0x222222),
  });
  const smoke = new THREE.Sprite(smokeMat);
  smoke.scale.set(smokeScale, smokeScale, smokeScale);
  smoke.position.copy(pos.clone().add(new THREE.Vector3(0, 0.1, 0)));
  smoke.userData = { name: "fireSprite_smoke" }
  buildingsGroup.add(smoke);

  let time = 0;
  function animateFire() {
    time += 0.03;
    const t = time;
    const s = 1 + Math.sin(t * 2.5) * 0.02; // 呼吸幅度，可调整
    fire.scale.set(fireScale * s, fireScale * s, fireScale * s);
    smoke.scale.set(smokeScale * s, smokeScale * s, smokeScale * s);
    requestAnimationFrame(animateFire);
  }
  animateFire();
}

export function updateFireSpriteFloor(floor) { 
  allGroup.children.forEach((item) => {
    if (item.userData.name == "fireSprite_fire") {
      const pos = getPosition(allData, floor);
      item.position.copy(pos);    
    } else if (item.userData.name == "fireSprite_smoke") {
      const pos = getPosition(allData, floor);
      item.position.copy(pos.clone().add(new THREE.Vector3(0, 0.2, 0)));
    }
  });

  updateTrappedPersonPos(floor)
}

export function updateFireSpriteSmoke(smoke, floor) {
  const fire_Scale = 0.3;
  const smoke_Scale = 0.4;
  const add_Height = 0.1
  if(smoke == 0){
    fireScale = fire_Scale  
    smokeScale = smoke_Scale
    updateSmoke(fireScale, smokeScale, add_Height, floor, false)
  }else if(smoke == 1){  
    fireScale = fire_Scale  
    smokeScale = smoke_Scale
    updateSmoke(fireScale, smokeScale, add_Height, floor)
  }else if(smoke == 2){
    fireScale = fire_Scale*2  
    smokeScale = smoke_Scale*2
    updateSmoke(fireScale, smokeScale, add_Height*2, floor)
  }else if(smoke == 3){
    fireScale = fire_Scale*4
    smokeScale = smoke_Scale*4
    updateSmoke(fireScale, smokeScale, add_Height*4, floor)
  }
} 

function updateSmoke(fireScale, smokeScale, addHeight, floor, haveSmoke = true) { 
  allGroup.children.forEach((item) => {
    if (item.userData.name == "fireSprite_fire") {    
      item.scale.set(fireScale, fireScale, fireScale);
    } else if (item.userData.name == "fireSprite_smoke") {      
      const pos = getPosition(allData, floor);
      item.position.copy(pos.clone().add(new THREE.Vector3(0, addHeight, 0)));
      item.scale.set(smokeScale, smokeScale, smokeScale);
      item.visible = haveSmoke
    }
  });
}

function getPosition(data, fireFloor) {
  const WALL_HEIGHT = commonSetting.wallAndFloor.WALL_HEIGHT; 
  const FLOOR_THICKNESS = commonSetting.wallAndFloor.FLOOR_THICKNESS;
  let floor = fireFloor
  if(fireFloor === 0) floor = parseInt(data.disasterBuilding.properties.met_upfloors)

  const centerPoint = turf.centroid(data.disasterBuilding) 
  const coor = centerPoint.geometry.coordinates
  const localCoord = lonLatToLocalCoord(coor[0], coor[1]); 
  const addH = floor * (FLOOR_THICKNESS + WALL_HEIGHT);

  return new THREE.Vector3(localCoord.x, addH, -localCoord.y)
}

export async function createTrappedPerson(buildingsGroup, data, floor) {
  allGroup = buildingsGroup
  allData = data
  const pos = getPosition(data, floor)
  let x = -0.25
  for (let i = 0; i < 8; i++) {
    x += 0.04
    const point = pos.clone().add(new THREE.Vector3(x, 0, 0))
    const trappedPerson =  await loadTrappedPerson(point)
    trappedPerson.visible = false
    buildingsGroup.add(trappedPerson); 
    trappedPersonGroup.push(trappedPerson)
  }
}

export function updateTrappedPerson(trapped, floor) {  
  trappedPersonGroup.forEach(item => item.visible = false )
  if(trapped == 0) return
  for (let i = 0; i < trappedPersonGroup.length; i++) {
    trappedPersonGroup[i].visible = true
    if(i == trapped -1) break
  }
}

function updateTrappedPersonPos(floor) {
  const pos = getPosition(allData, floor)
  let x = -0.25
  trappedPersonGroup.forEach(item => {
    x += 0.04
    const point = pos.clone().add(new THREE.Vector3(x, 0, 0))
    item.position.copy(point); 
  })
}

export async function loadTrappedPerson(pos) {  
  const gltf = await loadGLTF("/model3d/xf_trapped_man.glb");
  const model = gltf.scene; 
  model.userData = { name: "trappedPerson" }
  let scale = 0.0006
  model.scale.set(scale, scale, scale);  
  model.position.copy(pos); 
  return model;
}
