<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { easeOut } from "ol/easing";
import { useCurrentMap } from "@/composables/useCurrentMap";

const { currentMap: MapInstance } = useCurrentMap();

const rotate = ref(0);

const handleLeftClick = () => {
  handleRotate("left");
};

const handleRightClick = () => {
  handleRotate("right");
};

const handleRecovery = () => {
  handleRotate();
};

const handleRotate = (type?: any) => {
  const view: any = MapInstance.value?.getView();
  var rotation = 0;
  if (type == "right") {
    rotation = view.getRotation() + Math.PI / 8;
    rotate.value += 22.5;
  } else if (type == "left") {
    rotation = view.getRotation() - Math.PI / 8;
    rotate.value -= 22.5;
  } else {
    rotate.value = rotation;
  }
  view.animate({
    center: view.getCenter(), //旋转中心点
    rotation: rotation,
    easing: easeOut, //旋转速度
  });
};

onMounted(() => {
  nextTick(() => {
    if (MapInstance.value && Object.keys(MapInstance.value).length) {
      MapInstance.value.on("postrender", (mapEvent: { frameState: any }) => {
        const frameState = mapEvent.frameState;
        if (!frameState) {
          return;
        }
        const rotation = (frameState.viewState.rotation * 180) / Math.PI;
        if (rotate.value != rotation) {
          rotate.value = rotation;
        }
      });
    }
  });
});
</script>
<template>
  <div class="compass" style="transform: rotate(0deg)">
    <el-tooltip class="box-item" effect="dark" content="逆时针旋转" placement="left" :offset="10">
      <span class="left" @click="handleLeftClick"></span>
    </el-tooltip>
    <el-tooltip class="box-item" effect="dark" content="复位" placement="top" :offset="10">
      <span class="center" @click="handleRecovery" :style="{ transform: `rotate(${rotate}deg)` }"></span>
    </el-tooltip>
    <el-tooltip class="box-item" effect="dark" content="顺时针旋转" placement="bottom" :offset="10">
      <span class="right" @click="handleRightClick"></span>
    </el-tooltip>
  </div>
</template>
<style scoped lang="less">
/*
 * 雪碧图按主题切换：白天用原图，夜间用夜间版（深蓝圆盘 + 青色箭头 + 琥珀指针）。
 * 两张图尺寸一致（266×75），取图偏移完全相同。
 *
 * 实现：用 CSS 变量承载整条 background 简写，主题只切变量值，
 * 避免在 scoped 样式里写 html[data-theme] 逃逸选择器。
 */
@compass-sprite: url(@/assets/ui/sprites/earth-navi-control-pc4.png);
@compass-sprite-night: url(@/assets/ui/sprites/earth-navi-control-pc4-night.png);

/* 白天默认值（挂在 :root，供 .compass 继承） */
:global(html) {
  --compass-bg: @compass-sprite 0% 0% / 266px no-repeat;
  --compass-left: @compass-sprite -75px -5px / 266px no-repeat;
  --compass-left-hover: @compass-sprite -89px -5px / 266px no-repeat;
  --compass-center: @compass-sprite -56px -4px / 266px no-repeat;
}

.compass {
  height: 54px;
  width: 52px;
  position: absolute;
  right: 18px;
  bottom: 38px;
  z-index: 5;
  background: var(--compass-bg);

  .left,
  .center,
  .right {
    position: absolute;
    outline: none;
    border: none;
    cursor: pointer;
    opacity: 1;
  }

  .left {
    left: 2px;
    top: 5px;
    z-index: 5;
    width: 15px;
    height: 42px;
    background: var(--compass-left);
  }

  .left:hover {
    background: var(--compass-left-hover);
  }

  .center {
    background: var(--compass-center);
    left: 19px;
    top: 4px;
    width: 14px;
    height: 44px;
    transform: rotate(0deg);
    transition: 1s;
  }

  .right {
    right: 2px;
    top: 5px;
    z-index: 5;
    width: 15px;
    height: 42px;
    transform: scaleX(-1);
    background: var(--compass-left);
  }

  .right:hover {
    background: var(--compass-left-hover);
  }
}

/*
 * 夜间换用夜间雪碧图。
 *
 * 注意：变量必须定义在 :root（html）上而不是 .compass 上——
 * scoped 编译会把 `html[data-theme='NIGHT'] .compass` 里的后代选择器吃掉，
 * 只剩 html 规则；若把变量定义挂在 .compass 内，主题切换时不会重算。
 */
:global(html[data-theme='NIGHT']) {
  --compass-bg: @compass-sprite-night 0% 0% / 266px no-repeat;
  --compass-left: @compass-sprite-night -75px -5px / 266px no-repeat;
  --compass-left-hover: @compass-sprite-night -89px -5px / 266px no-repeat;
  --compass-center: @compass-sprite-night -56px -4px / 266px no-repeat;
}
</style>
