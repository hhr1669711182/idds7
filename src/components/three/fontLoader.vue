<script setup>
import { onMounted, ref } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import Stats from "three/examples/jsm/libs/stats.module";
import WEBGL from "three/examples/jsm/capabilities/WebGL.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

let scene, materials;
const init = () => {
  scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 600 / 500, 0.1, 10000);
  camera.position.z = 1000;
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(600, 500);
  document.getElementById("canvas").appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x404040));
  const light = new THREE.DirectionalLight(0xffffff, 8);
  light.position.set(200, 0, 200);
  scene.add(light);

  materials = [
    new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true }),
    new THREE.MeshPhongMaterial({ color: 0xff0550 }),
  ];

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.update();
  controls.addEventListener("change", () => renderer.render(scene, camera));

  const stats = new Stats();
  document.getElementById("stats").appendChild(stats.dom);
  stats.domElement.style.position = "absolute";
  stats.domElement.style.left = "0px";
  stats.domElement.style.top = "0px";

  const animate = () => {
    controls.update();
    renderer.render(scene, camera);
    stats.update();
    requestAnimationFrame(animate);
  };
  if (WEBGL.isWebGLAvailable()) {
    animate();
  } else {
    document.getElementById("msg").appendChild(WEBGL.getWebGLErrorMessage());
  }
};

const options = [
  { label: "Gentilis 粗体", value: "fonts/gentilis_bold.typeface.json" },
  { label: "Gentilis 常规体", value: "fonts/gentilis_regular.typeface.json" },
  { label: "Helvetiker 粗体", value: "fonts/helvetiker_bold.typeface.json" },
  { label: "Helvetiker 常规体", value: "fonts/helvetiker_regular.typeface.json" },
  { label: "Optimer 粗体", value: "fonts/optimer_bold.typeface.json" },
  { label: "Optimer 常规体", value: "fonts/optimer_regular.typeface.json" },
  {
    label: "YEFONT 电影庞白体",
    value: "fonts/YEFONTDianYingPangBaiTi_Regular.json",
  },
];

const textFamily = ref(options[0].value);
const text = ref("3D Text");
let textMesh;

const handleRenderText = () => {
  if (textMesh) scene.remove(textMesh);
  new FontLoader().load(textFamily.value, (font) => {
    const geometry = new TextGeometry(text.value, {
      font,
      size: 120,
      height: 10,
      curveSegments: 4,
      bevelEnabled: true,
      bevelThickness: 10,
      bevelSize: 8,
      bevelSegments: 5,
    });
    geometry.computeBoundingBox();
    const xOffset =
      (geometry.boundingBox.max.x - geometry.boundingBox.min.x) / 2;
    textMesh = new THREE.Mesh(geometry, materials);
    textMesh.position.set(-xOffset, 0, 0);
    scene.add(textMesh);
  });
};

onMounted(() => {
  init();
  handleRenderText();
});
</script>

<template>
  <div class="container">
    <div class="setPanel">
      <el-select
        v-model="textFamily"
        placeholder="选择字体"
        style="width: 200px; margin-right: 15px"
      >
        <el-option
          v-for="item in options"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        />
      </el-select>
      <el-input
        v-model="text"
        placeholder="输入文字"
        style="width: 120px; margin-right: 15px"
      />
      <el-button type="primary" @click="handleRenderText">确认</el-button>
    </div>
    <div id="canvas">
      <div id="stats" />
      <div id="msg" />
    </div>
  </div>
</template>

<style scoped>
.setPanel {
  display: flex;
  justify-content: start;
  margin-bottom: 10px;
}
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  width: 100%;
  flex-direction: column;
}
#stats,
#msg {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
}
#canvas {
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
}
</style>
