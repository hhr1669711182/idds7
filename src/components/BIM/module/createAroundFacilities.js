import * as THREE from "three";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { lonLatToLocalCoord } from "./commonThree.js";
import { commonSetting } from "./commonSetting.js";

export function drawAOIPath(buildingsGroup, coordinates) {
  if(!coordinates) return
  const shapePoints = [];
  coordinates.forEach(([lon, lat]) => {
    const localCoord = lonLatToLocalCoord(lon, lat, true);
    shapePoints.push(localCoord);
  }); 
  createPath(buildingsGroup, shapePoints);
}

function createPath(buildingsGroup, pathPoints, color = 0xFF7F27) {
  // 把点拆成 xyz 数组
  const positions = [];
  pathPoints.forEach((p) => positions.push(p.x, p.y, p.z));
  // 官方宽线几何体
  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({
    color: color,
    linewidth: 3, // 🔥 这里可以调大！5、8、10、15 都可以
    dashed: true,
    dashSize: 0.04,     // 实线段长度
    gapSize: 0.04,      // 空白段长度
    transparent: true,
    opacity: 1,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight), // 必须加
  });

  const line = new Line2(geometry, material);
  line.computeLineDistances();
  buildingsGroup.add(line);
}

export const loadAroundData = async (buildingsGroup) => {
  const lon = commonSetting.basePoint.baseLon 
  const lat = commonSetting.basePoint.baseLat
  
  const radius = commonSetting.searchRadius
  const ws = commonSetting.gisWorkspace
  const entranceExit = commonSetting.entranceExit.layerName
  const greatchinaRoad = commonSetting.greatchinaRoad.layerName
  const envEnterprises = commonSetting.envEnterprises.layerName
  const geom = commonSetting.entranceExit.geom

  const postBody = `
    <wfs:GetFeature service="WFS" version="1.0.0" outputFormat="json"
    xmlns:wfs="http://www.opengis.net/wfs"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:gml="http://www.opengis.net/gml">
    <wfs:Query typeName="${entranceExit}">
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
    <wfs:Query typeName="${greatchinaRoad}">
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
    <wfs:Query typeName="${envEnterprises}">
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
  const entranceExitData = data.features.filter( item => item.id.indexOf(entranceExit.split(':')[1]) == 0) 
  const greatchinaRoadData = data.features.filter( item => item.id.indexOf(greatchinaRoad.split(':')[1]) == 0) 
  const envEnterprisesData = data.features.filter( item => item.id.indexOf(envEnterprises.split(':')[1]) == 0) 
  
  drawEntranceExit(buildingsGroup, entranceExitData)
  drawEnvEnterprises(buildingsGroup, envEnterprisesData)
  drawRoadPath(buildingsGroup, greatchinaRoadData)  
};

function drawEnvEnterprises(buildingsGroup, data) {  
  if(data.length == 0) return  
  data.forEach(item => {
    const coordinates = item.geometry.coordinates
    const name = item.properties.dept_name
    const localCoord = lonLatToLocalCoord(coordinates[0], coordinates[1], true);     
    createEnvEnterprises(buildingsGroup, localCoord, 0.2);   
    //drawTextSprite(buildingsGroup, localCoord, name)
  }) 
}

function createEnvEnterprises(buildingsGroup, localCoord, size) {
  const texture = new THREE.TextureLoader().load("/model3d/xf_zddw.png");
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false, // 不写入深度，永远显示在最上层
  });

  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(localCoord);
  sprite.scale.set(size, size, size);  
  buildingsGroup.add(sprite);
}

function drawEntranceExit(buildingsGroup, data) {  
  if(data.length == 0) return  
  data.forEach(item => {
    const coordinates = item.geometry.coordinates
    const name = item.properties.name
    const localCoord = lonLatToLocalCoord(coordinates[0], coordinates[1], true);     
    //createEntranceExit(buildingsGroup, localCoord, 0.1);   
    drawTextSprite(buildingsGroup, localCoord, name)
  }) 
}

function createEntranceExit(buildingsGroup, localCoord, size) {
  const texture = new THREE.TextureLoader().load("/model3d/xf_entrance.png");
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false, // 不写入深度，永远显示在最上层
  });

  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(localCoord);
  sprite.scale.set(size, size, size);  
  buildingsGroup.add(sprite);
}

function drawRoadPath(buildingsGroup, data) {  
  if(data.length == 0) return  
  data.forEach(item => {
    const coordinates = item.geometry.coordinates[0]  
    const shapePoints = [];
    coordinates.forEach(([lon, lat]) => {
        const localCoord = lonLatToLocalCoord(lon, lat, true);
        shapePoints.push(localCoord);
    }); 
    createRoadPath(buildingsGroup, shapePoints);
    
  }) 
}

function createRoadPath(buildingsGroup, pathPoints, color = 0xFAD87C) {
  // 把点拆成 xyz 数组 
  const positions = [];
  pathPoints.forEach((p) => positions.push(p.x, p.y, p.z));
  // 官方宽线几何体
  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  const material = new LineMaterial({
    color: color,
    linewidth: 2, // 🔥 这里可以调大！5、8、10、15 都可以
    dashed: false,   
    transparent: true,
    opacity: 0.3,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight), // 必须加
  });

  const line = new Line2(geometry, material);
  line.computeLineDistances();
  buildingsGroup.add(line);
}

export function createClearTextSprite(text, options = {}) {
  const dpr = window.devicePixelRatio || 1;

  const {
    fontSize = 16,
    color = '#fff',
    bgColor = 'rgba(0,0,0,0.6)',
    padding = 2,    // 超窄内边距
    borderRadius = 2
  } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // 测量文字真实宽度
  ctx.font = `${fontSize * dpr}px sans-serif,"Microsoft YaHei"`;
  const textWidth = ctx.measureText(text).width;

  // 画布宽度 = 文字宽度 + 一点点内边距（非常窄）
  canvas.width = (textWidth + padding * 2) * dpr *0.6;
  canvas.height = (fontSize + padding * 2) * dpr;

  // 画背景
  ctx.fillStyle = bgColor;
  roundRect(ctx, 0, 0, canvas.width, canvas.height, borderRadius * dpr);
  ctx.fill();

  // ========== 关键：文字左对齐 ==========
  ctx.fillStyle = color;
  ctx.textAlign = 'left'; // 左对齐
  ctx.textBaseline = 'middle';
  //ctx.font = `bold ${fontSize * dpr}px sans-serif,"Microsoft YaHei"`;
   ctx.font = `${fontSize * dpr}px sans-serif,"Microsoft YaHei"`;
  
  // 左对齐：从 padding 位置开始画
  ctx.fillText(text, padding * dpr, canvas.height / 2);

  // 纹理高清设置
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;

  const mat = new THREE.SpriteMaterial({ 
    map: texture, 
    transparent: true, 
    depthTest: false,
    depthWrite: false 
  });
  const sprite = new THREE.Sprite(mat);

  // 缩放
  sprite.scale.set(
    (canvas.width / dpr) / 100,
    (canvas.height / dpr) / 100,
    1
  );

  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTextSprite(buildingsGroup, localCoord, text) {
  const sprite = createClearTextSprite(text, {
    fontSize: 9,
    padding: 2,
    bgColor: 'rgba(0,0,0,0.6)'
  });

  sprite.position.copy(localCoord.clone().add(new THREE.Vector3(0, 0.03, 0)));
  buildingsGroup.add(sprite);
}
