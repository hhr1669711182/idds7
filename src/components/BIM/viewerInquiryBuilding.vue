<template>
  <div class="full-screen-div">
    <!-- Three.js 画布容器 -->
    <div ref="container" class="three-canvas"></div>
    <div class="fire-info-panel">
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
    <div class="toolbar">
      <button class="toolbar-btn" @click="handleMoveScene">
        <img src="@/assets/icons/three_move.png" alt="平移" class="icon-img" />
      </button>
      <button class="toolbar-btn" @click="handleDrawPerson">
        <img src="@/assets/icons/three_draw.png" alt="标绘" class="icon-img" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import {
  initThree,
  loadData,
  animateRefresh,
  windowResize,
  disposeResource,
  clearBuildGroup,
  updateData,
  drawPointMarker,
} from "./module/viewerInquiryBuilding.js";
import { updateBIMType } from "./module/commonSetting.js";

import { onLoadModel } from "@/controller/three"
import { useDispatchStore } from "@/store";
const dispatchStore = useDispatchStore();

let currentBuildId = null;
let allFloors = [];
const formData = ref({
  floor: 1,
  totalFloor: 1,
  trapped: 0,
  smoke: 1,
});

const container = ref(null);
let animateId;
let lastTime = 0;

const handleFloorChange = () => {
  updateData(formData, updateBIMType.fireFloor)
  allFloors.forEach((f) => (f.visible = true));
  for (let i = 0; i < allFloors.length; i++) {
    if (i > formData.value.floor - 1) {
      allFloors[i].visible = false;
    }
  }
};

const handleTrappedChange = () => {
  updateData(formData, updateBIMType.trappedPerson)
}

const handleSmokeChange = () => {
  updateData(formData, updateBIMType.smokeSize)
}

const handleMoveScene = () => {
  window.removeEventListener("click", drawTrappedPerson);
}

const handleDrawPerson = () => {
  window.addEventListener("click", drawTrappedPerson);
}

const drawTrappedPerson = (event) => {
  drawPointMarker(event, formData)
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
    animate();
  }
}

function stopRender() {
  if (animateId) {
    cancelAnimationFrame(animateId);
    animateId = null;
  }
}

onActivated(() => {
  //console.log("onActivated")
  startRender();
});

onDeactivated(() => {
  //console.log("onDeactivated")
  stopRender();
});

onMounted(async () => {
  // if (container.value) {
  //   await initThree(container, allFloors, dispatchStore, false);
  //   formData.value.totalFloor = allFloors.length
  //   formData.value.floor = allFloors.length
  //   startRender();
  // }

  onLoadModel(async (data) => {
    if (container.value) {
      const { buildId, floor, totalFloor, trappedCount, smokeCondition } = data;
      Object.assign(formData.value, { floor, trapped: trappedCount, smoke: smokeCondition })

      const dis = {
        buildId: data.buildId,
        lon: data.lon,
        lat: data.lat,
      }

      if (currentBuildId === buildId) {
        // formData.value.totalFloor = allFloors.length;
        // startRender();
        handleFloorChange();
        handleTrappedChange();
        handleSmokeChange();
        return;
      }

      if (currentBuildId !== null) {
        clearBuildGroup();
        allFloors = [];
        await loadData(allFloors, dis);
      } else {
        await initThree(container, allFloors, dis, false);
      }

      currentBuildId = buildId;
      formData.value.totalFloor = allFloors.length;
      startRender();

        handleFloorChange();
        handleTrappedChange();
        handleSmokeChange();
    }
  })
});

onUnmounted(() => {
  currentBuildId = null;
  stopRender();
  disposeResource(container);
  window.removeEventListener("resize", handleResize);
  window.removeEventListener("click", drawTrappedPerson);
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
  background-color: #202555;
  /* background-color: #eaf3ff; */
  /* 可选：子元素居中（按需添加） */
  display: flex;
  justify-content: center;
  align-items: center;
}

.three-canvas {
  width: 100%;
  height: 100%;
}

.fire-info-panel {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.65);
  padding: 12px 14px;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  z-index: 999;
  width: 240px;
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

.toolbar {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.65);
  padding: 4px 4px;
  border-radius: 8px;
  z-index: 999;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 图标按钮样式 */
.toolbar-btn {
  width: 30px;
  height: 30px;
  background: #1a1a1a;
  border: 1px solid #8a5a3c;
  border-radius: 6px;
  cursor: pointer;
  outline: none;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.toolbar-btn:hover {
  border-color: #d27a48;
  background: #252525;
}

/* PNG图标大小控制 */
.icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
}
</style>
