<!--
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-05-21 11:24:08
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\baseComponent\keyboardNote.vue
-->
<script setup lang="ts"></script>
<template>
  <div class="keyboardNote">
    <div class="item">
      <div class="key">Shift</div>
      + 鼠标拖动，框选放大
    </div>
    <div class="item">
      <div class="key">Shift</div>
      +
      <div class="key">Alt</div>
      + 鼠标拖动，地图旋转
    </div>
  </div>
</template>
<style scoped>
.keyboardNote {
  position: absolute;
  right: 100px;
  bottom: 60px;
  border-radius: 6px;
  padding: 6px 5px;
  background-color: rgba(94, 210, 225, 0.72);
  font-size: 12px;
}
.key {
  display: inline-block;
  width: 30px;
  height: 20px;
  margin: 2px;
  background-color: #f0f0f0;
  border: 1px solid #ccc;
  border-radius: 2px;
  text-align: center;
  line-height: 20px;
  font-family: Arial, sans-serif;
  box-shadow: 0 1px #999;
  transition: all 0.1s ease;
}
</style>
