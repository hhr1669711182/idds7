<template>
  <div class="geo-picker">
    <div ref="mapRef" class="geo-picker__map">
    <GeoPickerToolbar
      :can-undo="canUndo"
      :can-redo="canRedo"
      @undo="undo"
      @redo="redo"
      @clear="clearAll"
    />
    <ZoomLevelControl :zoom="zoom" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import GeoPickerToolbar from './GeoPickerToolbar.vue'
import ZoomLevelControl from '@/baseComponent/OpenlayersMap/ZoomLevelControl.vue'
import { useGeoPicker, type GeoPickerMode } from './useGeoPicker'

const props = defineProps<{ mode: GeoPickerMode }>()
const { mapRef, canUndo, canRedo, zoom, init, undo, redo, clearAll } = useGeoPicker(props.mode)

onMounted(() => {
  document.documentElement.setAttribute('data-theme', 'DAY') // 默认日间主题
  if (mapRef.value) init(mapRef.value)
})
</script>

<style lang="less" scoped>
.geo-picker {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;

  &__map {
    width: 100%;
    height: 100%;
  }
}
</style>
