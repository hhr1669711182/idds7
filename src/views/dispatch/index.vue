<script setup lang="ts">
import DispatchMap from '@/components/dispatchMap/index.vue';
</script>

<template>
  <div class="dispatch-view">
    <DispatchMap />
  </div>
</template>

<style scoped>
.dispatch-view {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>
