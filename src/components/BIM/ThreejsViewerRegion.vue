<template>
  <div class="full-screen-div">
    <!-- Three.js 画布容器 -->
    <div ref="container" class="three-canvas"></div>
    <div class="fire-detail-card"> 
      <div class="card-header">
        <div>
          <div class="building-title">🔥 {{ formData.buildingName }}</div>
          <div class="building-address">📍 {{ formData.buildingAddress }}</div>
        </div>
        <button class="fold-btn" @click="toggleCard">
          {{ isFold ? '展开 ▶' : '收起 ◀' }}
        </button>
      </div>
      <div class="fire-info-panel" v-show="!isFold">
        <!-- 楼层总数 -->
        <div class="info-row">
          <label class="label">楼层总数</label>
          <div class="input-wrapper">
            <input type="number" class="input-field" v-model.number="formData.floor" min="1" :max="formData.totalFloor"
              @change="handleFloorChange" />
            <span class="suffix">/ {{ formData.totalFloor }} 层</span>
          </div>
        </div>

        <!-- 起火楼层 -->
        <div class="info-row">
          <label class="label">起火楼层</label>
          <div class="input-wrapper">
            <input type="number" class="input-field" v-model.number="formData.floor" min="1" :max="formData.totalFloor"
              @change="handleFloorChange" />
            <span class="suffix">/ {{ formData.totalFloor }} 层</span>
          </div>
        </div>

        <!-- 被困人数 -->
        <div class="info-row">
          <label class="label">被困人数</label>
          <div class="input-wrapper">
            <input type="number" class="input-field" v-model.number="formData.trapped" @change="handleTrappedChange"
              min="0" />
            <span class="suffix">人</span>
          </div>
        </div>

        <!-- 烟雾情况（下拉） -->
        <div class="info-row">
          <label class="label">烟雾情况</label>
          <div class="select-wrapper">
            <select class="select-field" v-model="formData.smoke" @change="handleSmokeChange">
              <option value=0>无</option>
              <option value=1>少量</option>
              <option value=2>中度</option>
              <option value=3>浓重</option>
            </select>
            <span class="arrow-icon">▼</span>
          </div>
        </div>
      </div>
    </div>

    <div class="compass-wrap" id="compassEl">
      <div class="compass-circle">
        <div class="dir-n">N</div>
        <div class="dir-s">S</div>
        <div class="dir-w">W</div>
        <div class="dir-e">E</div>
        <div class="needle-container" id="needleBox">
          <div class="needle-n"></div>
          <div class="needle-s"></div>
        </div>
      </div>
      <div class="compass-text" id="resetNorthBtn">复位</div>
    </div>
  </div>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { ref, onMounted, onUnmounted, onActivated, onDeactivated } from "vue";
import {
  initThree,
  updateThree,
  animateRefresh,
  windowResize,
  disposeResource,
  updateFireBuilding,
  updateData,
} from "./module/initThreeRegion.js";
import { updateBIMType } from "./module/commonSetting.js";
import { useDispatchStore } from "@/store";
const route = useRoute()
const dispatchStore = useDispatchStore();
const formData = ref({
  buildingName: "黄浦中银商务大厦",
  buildingAddress: "上海市黄浦区南京东路120号",
  floor: 1,
  totalFloor: 1,
  trapped: 1,
  smoke: 1,
});

const container = ref(null);
const isFold = ref(false)
//const selectedWindow = ref("7");
let animateId;
let lastTime = 0;
let allFloors = [];

const toggleCard = () => {
  isFold.value = !isFold.value
  // if(isFold.value) controlMicroRegion(0)
  // else controlMicroRegion(1)
}

const controlMicroRegion = async (data) => {
  await updateThree(allFloors, dispatchStore, route, data);  

}

const handleFloorChange = () => {
  updateFireBuilding(formData.value.floor - 1, allFloors)
  updateData(formData, updateBIMType.fireFloor)
  // allFloors.forEach((f) => (f.visible = true));
  // for (let i = 0; i < allFloors.length; i++) {
  //   if (i > formData.value.floor - 1) {
  //     allFloors[i].visible = false;
  //   }
  // }
};

const handleSmokeChange = () => {
  updateData(formData, updateBIMType.smokeSize)
}

const handleTrappedChange = () => {
  updateData(formData, updateBIMType.trappedPerson)
}

const animate = () => {
  const now = performance.now();
  const clockChange = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  animateId = requestAnimationFrame(animate);
  animateRefresh(clockChange);
};

function startRender() {
  if (!animateId) {
    animate()
  }
}

function stopRender() {
  if (animateId) {
    cancelAnimationFrame(animateId)
    animateId = null
  }
}

onActivated( async () => {
  //console.log("onActivated")
  stopRender()
  //await initThree(container, allFloors, dispatchStore);
  startRender()
})

onDeactivated(() => {
  //console.log("onDeactivated")
  //stopRender()
})

onMounted(async () => {
  if (container.value) {
    allFloors=[]
    await initThree(container, allFloors, dispatchStore, route);  
    formData.value.totalFloor =  allFloors.length
    formData.value.floor =  allFloors.length
    updateFireBuilding(formData.value.floor - 1, allFloors)
    startRender();
  }
});


onUnmounted(() => {
  stopRender()  
  disposeResource(container);
  window.removeEventListener("resize", handleResize);
});

const handleResize = () => {
  windowResize(container);
};
window.addEventListener("resize", handleResize);
</script>
<style scoped>
.full-screen-div {
  /* 1. 占满视口宽高 */
  width: 100vw;
  height: 100vh;
  /* 2. 清除默认边距（避免出现滚动条） */
  margin: 0;
  padding: 0;
  /* 3. 可选：固定定位（防止滚动时偏移） */
  position: fixed;
  top: 0;
  left: 0;
  /* 可选：背景色，方便查看效果 */
  background-color: #f5f5f5;
  /* 可选：子元素居中（按需添加） */
  display: flex;
  justify-content: center;
  align-items: center;
}

.three-canvas {
  width: 100%;
  height: 100%;
}

.fire-detail-card {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.65);
  padding: 12px 12px;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  z-index: 999;
  width: 280px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}

.building-title {
  font-size: 14px;
  font-weight: bold;
  color: #ffffff;
  margin-bottom: 8px;
}

.building-address {
  font-size: 14px;
  color: #aaaaaa;
}

.fold-btn {
  background-color: #25272c;
  border: 1px solid #666666;
  color: #fff;
  border-radius: 4px;
  padding: 4px 4px;
  font-size: 10px;
  cursor: pointer;
}

.fire-info-panel {
  background: rgba(0, 0, 0, 0.25);
  padding: 12px 12px;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  z-index: 999;
}

.info-row {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.info-row:last-child {
  margin-bottom: 0;
}

/* 统一 14px 字体 */
.label {
  width: 80px;
  font-size: 14px;
  color: #b8c2cc;
  user-select: none;
}

.input-wrapper,
.select-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  position: relative;
}

/* 输入框样式 */
.input-field {
  width: 100%;
  height: 32px;
  background: #1a1a1a;
  border: 1px solid #8a5a3c;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  padding: 0 10px;
  outline: none;
}

.input-field:focus {
  border-color: #d27a48;
}

.suffix {
  margin-left: 8px;
  font-size: 14px;
  color: #b8c2cc;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 下拉框样式 */
.select-field {
  width: 100%;
  height: 32px;
  background: #1a1a1a;
  border: 1px solid #8a5a3c;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  padding: 0 10px;
  outline: none;
  appearance: none;
}

.select-field:focus {
  border-color: #d27a48;
}

.arrow-icon {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  color: #b8c2cc;
  pointer-events: none;
}

/* 指南针容器：固定右上角 */
  .compass-wrap {
    position: fixed;
    top: 10px;
    right: 10px;
    width: 148px;
    height: 188px;
    background: rgba(0, 0, 0, 0.65);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 100; /* 悬浮在3D画布上方 */
    cursor: pointer;
    user-select: none;
    transform: scale(0.5);
    transform-origin: top right;
  }
  .compass-circle {
    position: relative;
    width: 110px;
    height: 110px;
    border-radius: 50%;
    border: 2px solid #eee;
    margin-bottom: 12px;
  }
  /* 方位文字 */
  .dir-n { position: absolute; top: 4px; left: 50%; transform: translateX(-50%); color: #fff; font-weight: bold; }
  .dir-s { position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); color: #fff; font-weight: bold; }
  .dir-w { position: absolute; left: 4px; top: 50%; transform: translateY(-50%); color: #fff; font-weight: bold; }
  .dir-e { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); color: #fff; font-weight: bold; }
  /* 指针容器，随相机旋转 */
  .needle-container {
    width: 100%;
    height: 100%;
    transition: transform 0.2s ease;
  }
  /* 红色北指针、灰色南指针 */
  .needle-n {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    /* 三角形：上红，左右透明，形成向上尖头 */
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 30px solid #ff3333;
    transform-origin: center bottom;
    transform: translate(-50%, -100%);
    /* 红色外发光，匹配截图辉光效果 */
    filter: drop-shadow(0 0 6px #ff3333);
  }

  .needle-s {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    /* 向下的灰色三角形 */
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 30px solid #aaaaaa;
    transform-origin: center top;
    transform: translate(-50%, 0);
  }
  .compass-text {
    color: #fff;
    font-size: 20px;
  }
</style>
