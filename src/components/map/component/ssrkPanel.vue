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
  border-radius: var(--radius-md);
  box-shadow: var(--panel-shadow);
  position: absolute;
  left: 54px;
  bottom: 150px;
  width: 180px;
  height: 70px;

  background-color: var(--panel-bg);
  border: 1px solid var(--panel-border);
  padding: 10px;
  color: var(--text-primary);
  font-family: Arial, sans-serif;
  font-size: 12px;
  z-index: 1001;

  .title {
    font-weight: bold;
    margin-bottom: 4px;
    color: var(--text-primary);
  }

  .color-bar {
    width: 100%;
    height: 12px;
    background: linear-gradient(to right, blue, cyan, green, yellow, red);
    border-radius: var(--radius-sm);
    margin-bottom: 5px;
  }

  .scale {
    display: flex;
    justify-content: space-between;
    color: var(--text-muted);
  }
}
</style>
