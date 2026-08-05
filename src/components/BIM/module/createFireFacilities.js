import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import * as turf from '@turf/turf'
import { lonLatToLocalCoord, loadGLTF } from "./commonThree.js";
import { commonSetting } from "./commonSetting.js";

export async function loadFireFighter(buildingsGroup) {
  const gltf = await loadGLTF("/model3d/xf_firefighter.glb");
  const model = gltf.scene;
  model.scale.setScalar(0.1);
  model.position.set(0.35, 0, -0.8);
  buildingsGroup.add(gltf.scene);
  //model.visible=false
  let mixer = new THREE.AnimationMixer(gltf.scene);
  if (gltf.animations.length > 0) {
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
  }
  return mixer;
}

export async function loadFireTruck(buildingsGroup, coor) {
  const gltf = await loadGLTF("/model3d/xf_fire_truck.glb");
  const model = gltf.scene;
  model.scale.setScalar(0.06);
  const localCoord = lonLatToLocalCoord(coor[0], coor[1], true);
  model.position.set(localCoord.x, localCoord.y, localCoord.z);
  //fireTruck = model;
  //fireTruck.rotation.y += Math.PI / 2
  buildingsGroup.add(gltf.scene);
  return model;
}

export async function loadFireHydrant(buildingsGroup, isMicroRegion, d) {
  const res = await getFireHydrantData(d)
  if(!res.features || (res.features.length == 0)) return

  let data = res.features
  if(!isMicroRegion) {
    const basePoint = [
      commonSetting.basePoint.baseLon,
      commonSetting.basePoint.baseLat,
    ];
    const buildRadius = commonSetting.buildRadius
    data = res.features.filter(item => calculateFireHydrant(item, basePoint, buildRadius))
  }
  drawFireHydrant(buildingsGroup, data) 
}

const calculateFireHydrant = (item, basePoint, buildRadius) => {
  const distance = turf.distance(basePoint, item.geometry.coordinates, { units: "meters" });
  return distance < buildRadius
};

const drawFireHydrant = (buildingsGroup, features) => {  
  const loader = new OBJLoader();
  loader.load("/model3d/xf_fire_hydrant.obj", (object) => {
    const allGeometries = [];
    object.traverse((child) => {
      if (child.isMesh) {      
        allGeometries.push(child.geometry);    
      }
    });

    let mergedGeometry = BufferGeometryUtils.mergeGeometries(allGeometries);
    let scale = 0.002;
    mergedGeometry.scale(scale, scale, scale);
    mergedGeometry.rotateX(-Math.PI / 2);
    const instMesh = new THREE.InstancedMesh(
      mergedGeometry,
      new THREE.MeshLambertMaterial({ color: 0xff0000 }),
      features.length,
    );
    instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const matrix = new THREE.Matrix4();
    
    features.forEach((item, idx) => {
      const coor = item.geometry.coordinates;
      const localCoord = lonLatToLocalCoord(coor[0], coor[1]);
      matrix.identity();
      matrix.setPosition(localCoord.x, 0, -localCoord.y);
      instMesh.setMatrixAt(idx, matrix);
    });
    instMesh.instanceMatrix.needsUpdate = true;   
    buildingsGroup.add(instMesh);  
  });
}

const getFireHydrantData = async (op) => {
  const lon = op?.lon ?? commonSetting.basePoint.baseLon;
  const lat = op?.lat ?? commonSetting.basePoint.baseLat;
  const layerName = op?.layer ?? commonSetting.fireHydrant.layerName;

  const radius = commonSetting.searchRadius
  const url = commonSetting.geoServerUrl
  const ws = commonSetting.gisWorkspace
  // const layerName = commonSetting.fireHydrant.layerName
  const geom = commonSetting.fireHydrant.geom

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
  console.log("data ", data)
  return data
};
