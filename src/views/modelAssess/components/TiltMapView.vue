<!--
  @Description: 3D/2D 主视图（TiltMapView）：内部委托给 <ThreeViewer>，3D/2D 模式切换 + 弹窗
 * @FilePath: \ids-gis-web\src\views\modelassess\components\TiltMapView.vue
-->
<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useModelAssessStore } from '@/store/useModelAssessStore'
import { useDispatchStore } from '@/store/useDispatchStore'
import { LAYER_TABS } from '@/const/const.modelAssess'
import type { LayerTabKey } from '@/const/const.modelAssess'
import type { PickComponentInfo } from '../composables/useThreeScene'
import ThreeViewer from './ThreeViewer.vue'
import FloorPlan2D from './FloorPlan2D.vue'
import ComponentDetailPopover from './ComponentDetailPopover.vue'
import RouteDebugPanel from './RouteDebugPanel.vue'
import MasterAlarmPanel from './MasterAlarmPanel.vue'
import Compass3D from './Compass3D.vue'

const store = useModelAssessStore()
const dispatchStore = useDispatchStore()
const {
  realtimeFactors,
  trappedFloors,
  activeLayerTab,
  selectedTrappedUuid,
  selectedFloor,
  modelLoaded,
  plan2DMode,
  masterAlarm,
} = storeToRefs(store)

/** 上游 navPathPlanData（响应式追踪；WebSocket 更新时会自动重播） */
const navPathPlanData = computed(() => dispatchStore.navPathPlanData)

const onTab = (k: LayerTabKey) => {
  store.setActiveLayerTab(k)
}

const visibleLayers = computed(() => ({
  composite: activeLayerTab.value === 'composite',
  vehicles: activeLayerTab.value === 'vehicles',
  water: activeLayerTab.value === 'water',
}))

const onPickFloor = (floor: number) => store.pickFloor(floor)
const onPickMarker = (uuid: string) => store.selectTrappedFloor(uuid)
const onPickComponent = (info: PickComponentInfo) => {
  store.setSelectedComponent(info)
}
const onSwitch3D = () => store.setPlan2DMode(false)
const onSwitch2D = () => store.setPlan2DMode(true)

/** 主警情 ThreeViewer 模型加载完成 → store.modelLoaded = true（HUD 提示消失） */
const onModelLoaded = () => store.setModelLoaded(true)
</script>

<template>
  <div class="tilt-map">
    <!-- 顶部图层切换 + 3D/2D 切换 -->
    <!-- <div class="layer-tabs">
      <div
        v-for="t in LAYER_TABS"
        :key="t.key"
        :class="['tab', { active: activeLayerTab === t.key }]"
        @click="onTab(t.key)"
      >
        {{ t.label }}
      </div>
      <div class="tab-divider"></div>
      <el-button-group>
        <el-button
          :type="plan2DMode ? 'default' : 'warning'"
          size="small"
          @click="onSwitch3D"
        >
          🎮 3D
        </el-button>
        <el-button
          :type="plan2DMode ? 'warning' : 'default'"
          size="small"
          @click="onSwitch2D"
        >
          📐 2D 平面
        </el-button>
      </el-button-group>
    </div> -->

    <!-- 高度 / 楼层标签 -->
    <!-- <div class="altitude-tag">
      ⏐ 高 {{ realtimeFactors.buildingHeight }}m ({{ realtimeFactors.totalFloors }}F)
    </div> -->

    <!-- 加载 / 选中提示（仅 3D 模式下显示） -->
    <!-- <div class="hud-info" v-if="!modelLoaded && !plan2DMode">⏳ 3D 模型加载中...</div>
    <div class="hud-info" v-else-if="selectedTrappedUuid && !plan2DMode">🎯 已选中受困标牌</div>
    <div class="hud-info" v-else-if="selectedFloor && !plan2DMode">👆 已选中第 {{ selectedFloor }} 层</div> -->

    <!-- 路线操作栏（重播路线 / 恢复全景视角 / 跟随车辆）— 仅 3D 模式显示 -->
    <!-- <RouteDebugPanel v-if="!plan2DMode" /> -->

    <!-- 主体：3D 视图 / 2D 平面图（互斥显示） -->
    <transition name="mode-fade" mode="out-in">
      <ThreeViewer
        v-if="!plan2DMode"
        key="3d"
        data-source="masterAlarm"
        :master-alarm="masterAlarm"
        :realtime-factors="realtimeFactors"
        :trapped-floors="trappedFloors"
        :visible-layers="visibleLayers"
        :route-plan="navPathPlanData"
        :show-hud="true"
        height="100%"
        @pick-floor="onPickFloor"
        @pick-marker="onPickMarker"
        @pick-component="onPickComponent"
        @model-loaded="onModelLoaded"
      />
      <FloorPlan2D
        v-else
        key="2d"
        :floor="selectedFloor || realtimeFactors.fireFloor"
        :realtime-factors="realtimeFactors"
        :trapped-floors="trappedFloors"
        @pick-marker="onPickMarker"
      />
    </transition>

    <!-- 左上角折叠/展开的主控面板 -->
    <MasterAlarmPanel class="overlay-panel master-overlay" />

    <!-- 右下角指南针 -->
    <!-- <Compass3D class="overlay-panel compass-overlay" v-if="!plan2DMode" /> -->

    <!-- 顶部起火层 HUD -->
    <!-- <div class="fire-hud">🔥 起火层：第 {{ realtimeFactors.fireFloor }} 层 / {{ realtimeFactors.fireHeight }}m</div> -->

    <!-- 构件详情弹窗 -->
    <!-- <ComponentDetailPopover /> -->
  </div>
</template>

<style lang="less" scoped>
@import '../styles/model-assess.less';
@import '../styles/model3d.less';

.layer-tabs {
  .tab-divider {
    display: inline-block;
    width: 1px;
    background: #1f2940;
    margin: 4px 4px;
    height: 24px;
    vertical-align: middle;
  }
}

.mode-fade-enter-active,
.mode-fade-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.mode-fade-enter-from,
.mode-fade-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.overlay-panel {
  position: absolute;
  z-index: 20;
}

.master-overlay {
  top: 10px;
  left: 10px;
}

.compass-overlay {
  bottom: 60px;
  right: 20px;
}
</style>
