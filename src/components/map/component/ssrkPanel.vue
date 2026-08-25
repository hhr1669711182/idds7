<template>
  <div class="ssrk_panel">
    <div class="title">人口热力图例</div>
    <div class="color-bar"></div>
    <div class="scale">
      <span>0</span>
      <span>1000</span>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped lang="less">
.ssrk_panel {
  border-radius: 8px;
  box-shadow: 0 2px 4px #0000004d;
  position: absolute;
  left: 54px;
  bottom: 150px;
  width: 180px;
  height: 70px;

  background-color: #2f3c4f;
  padding: 10px;
  color: white;
  font-family: Arial, sans-serif;
  font-size: 12px;
  z-index: 1001;

  .title {
    font-weight: bold;
    margin-bottom: 4px;
  }

  .color-bar {
    width: 100%;
    height: 12px;
    background: linear-gradient(to right, blue, cyan, green, yellow, red);
    border-radius: 4px;
    margin-bottom: 5px;
  }

  .scale {
    display: flex;
    justify-content: space-between;
  }
}
</style>
