<script setup>
import { ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useMapStore } from "../../store";

const mapStore = useMapStore();

const { mode } = storeToRefs(mapStore);

const handleChange = () => {
  mapStore.setMapMode(mode.value == "3D" ? "2D" : "3D");
};
</script>
<template>
  <span @click="handleChange" :class="{ active: mode == '3D' }"></span>
</template>

<style scoped>
span {
  position: absolute;
  z-index: 5;
  outline: none;
  border: none;
  cursor: pointer;
  width: 26px;
  height: 26px;
  right: 18px;
  bottom: 150px;
  background-color: var(--panel-bg-solid);
  box-shadow: var(--panel-shadow);
  /* 精灵图底色随主题变化：夜间用深色，白天用白色 */
  background-image: url(@/assets/ui/sprites/gl-navi-control-pc4.png);
  background-repeat: no-repeat;
  background-size: 266px;
  background-position: -188px 1px;
}

span:hover {
  background-position: -240px 1px;
}

span.active {
  background-position: -110px 1px;
}

span.active:hover {
  background-position: -162px 1px;
}
</style>
