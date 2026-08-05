<template>
  <div class="full-screen-div">
    <!-- Three.js 画布容器 -->
    <div ref="container" class="three-canvas"></div>
    <div class="dropdown-container">
      <label>显示楼层：</label>
      <select v-model="selectedWindow" @change="onWindowChange">
        <option value="7">8楼</option>
        <option value="6">7楼</option>
        <option value="5">6楼</option>
        <option value="4">5楼</option>
        <option value="3">4楼</option>
        <option value="2">3楼</option>
        <option value="1">2楼</option>
        <option value="0">1楼</option>
      </select>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import {
  initThree,
  animateRefresh,
  windowResize,
  disposeResource,
  drawPointMarker,
} from "./module/initThreeBuilding.js";
import { useDispatchStore } from "@/store";
const dispatchStore = useDispatchStore();

const container = ref(null);
const selectedWindow = ref("7");
let animateId;
let lastTime = 0;
let allFloors = [];

const onWindowChange = () => {
  console.log("change floor ", selectedWindow.value);
  allFloors.forEach((f) => (f.visible = true));
  for (let i = 0; i < allFloors.length; i++) {
    if (i > selectedWindow.value) {
      allFloors[i].visible = false;
    }
  }
};

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

onActivated(() => {
  //console.log("onActivated")
  startRender()
})

onDeactivated(() => {
  //console.log("onDeactivated")
  stopRender()
})

onMounted(async () => {
  if (container.value) {
    await initThree(container, allFloors, dispatchStore, false);
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

window.addEventListener('click', (event) => {
  //drawPointMarker(event)
})
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

:deep(.building-label) {
  user-select: none; /* 禁止选中文字 */
  pointer-events: auto; /* 如需点击标注，设为auto */
}

.viewer-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.three-canvas {
  width: 100%;
  height: 100%;
}

/* 🔥 下拉框样式（悬浮在左上角） */
.dropdown-container {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 999;
  background: white;
  padding: 8px 12px;
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 8px;
}

select {
  padding: 4px 8px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}
</style>
