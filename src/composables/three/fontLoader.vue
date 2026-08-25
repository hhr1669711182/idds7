<script setup>
import { onMounted, ref } from "vue";
import * as THREE from "three";
// 引入扩展库OrbitControls.js
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
// 性能检测
import Stats from "three/examples/jsm/libs/stats.module";
//  加载 WebGl 探测器
import WEBGL from "three/examples/jsm/capabilities/WebGL.js";
// 字体加载器
import { FontLoader } from "three/addons/loaders/FontLoader.js";
// 字体模型
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

let scene, materials;
const init = () => {
  // 创建场景
  scene = new THREE.Scene();
  // 创建相机
  let camera = new THREE.PerspectiveCamera(75, 600 / 500, 0.1, 10000);
  // 修改相机位置
  camera.position.z = 1000;
  camera.lookAt(new THREE.Vector3(0, 0, 0));
  // 创建渲染器
  let renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(600, 500);
  document.getElementById("canvas").appendChild(renderer.domElement);

  // 添加环境光
  scene.add(new THREE.AmbientLight(0x404040));
  // 创建平行光
  let light = new THREE.DirectionalLight(0xffffff, 8);
  light.position.set(200, 0, 200);
  scene.add(light);

  // 创建材质
  materials = [
    new THREE.MeshPhongMaterial({
      color: 0xffffff,
      flatShading: true,
    }),
    new THREE.MeshPhongMaterial({ color: 0xff0550 }),
  ];

  // 设置相机控件轨道控制器OrbitControls
  let controls = new OrbitControls(camera, renderer.domElement);
  //更新控制器
  controls.update();
  // 如果相机控件修改了相机参数 重新调用渲染器
  controls.addEventListener("change", function () {
    renderer.render(scene, camera);
  });
  //初始化性能插件
  var stats;
  stats = new Stats();
  document.getElementById("stats").appendChild(stats.dom);
  stats.domElement.style.position = "absolute";

  stats.domElement.style.left = "0px";

  stats.domElement.style.top = "0px";

  function animate() {
    //更新控制器
    controls.update();
    // 渲染
    renderer.render(scene, camera);
    //更新性能插件
    stats.update();
    requestAnimationFrame(animate);
  }
  if (WEBGL.isWebGLAvailable()) {
    animate();
  } else {
    const warning = WEBGL.getWebGLErrorMessage();
    document.getElementById("msg").appendChild(warning);
  }
};

const options = [
  { label: "Gentilis 粗体", value: "fonts/gentilis_bold.typeface.json" },
  { label: "Gentilis 常规体", value: "fonts/gentilis_regular.typeface.json" },
  { label: "Helvetiker 粗体", value: "fonts/helvetiker_bold.typeface.json" },
  { label: "Helvetiker 粗体", value: "fonts/helvetiker_regular.typeface.json" },
  { label: "Optimer 粗体", value: "fonts/optimer_bold.typeface.json" },
  { label: "Optimer 粗体", value: "fonts/optimer_regular.typeface.json" },
  {
    label: "YEFONT 电影庞白体",
    value: "fonts/YEFONTDianYingPangBaiTi_Regular.json",
  },
];

const textFamily = ref(options[0].value);

const text = ref("3D Text");

let textMesh;
const handleRenderText = () => {
  if (textMesh) {
    scene.remove(textMesh);
  }
  const loader = new FontLoader();

  loader.load(textFamily.value, function (font) {
    const geometry = new TextGeometry(text.value, {
      font: font,
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
        >
        </el-option>
      </el-select>
      <el-input
        v-model="text"
        placeholder="输入文字"
        style="width: 120px; margin-right: 15px"
      ></el-input>
      <el-button type="primary" @click="handleRenderText">确认</el-button>
    </div>
    <div id="canvas">
      <div id="stats"></div>
      <div id="msg"></div>
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
