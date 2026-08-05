<!--
  @Description: 通用 3D 视图容器（被主警情 TiltMapView + 相似卡片 SimilarAlarmCard 复用）
 * @FilePath: \ids-gis-web\src\views\modelAssess\components\ThreeViewer.vue
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watch, watchEffect, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useThreeScene, type PickComponentInfo } from '../composables/useThreeScene'
import {
  registerMasterController,
  unregisterMasterController,
} from '../composables/useThreeController'
import { useModelAssessStore } from '@/store/useModelAssessStore'
import type {
  MasterAlarm,
  RealtimeFactors,
  TrappedFloorItem,
  SimilarAlarmCardItem,
} from '@/const/const.modelAssess'

interface Props {
  dataSource: 'masterAlarm' | 'similarAlarm'
  similarCardData?: SimilarAlarmCardItem
  masterAlarm?: MasterAlarm
  realtimeFactors?: RealtimeFactors
  trappedFloors?: TrappedFloorItem[]
  visibleLayers?: { composite: boolean; vehicles: boolean; water: boolean }
  /** 路线动画数据（来自 useDispatchStore.navPathPlanData），未传则自动从 store 读取 */
  routePlan?: Record<string, any>
  /** 路线动画总时长（毫秒） */
  routeDurationMs?: number
  interactive?: boolean
  showHUD?: boolean
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  visibleLayers: () => ({ composite: true, vehicles: false, water: false }),
  interactive: true,
  showHUD: false,
  height: '100%',
  routeDurationMs: 8000,
})

const emit = defineEmits<{
  (e: 'pick-floor', floor: number): void
  (e: 'pick-marker', uuid: string): void
  (e: 'pick-component', info: PickComponentInfo): void
  (e: 'model-loaded'): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const isMaster = props.dataSource === 'masterAlarm'

/** 用 ref 持有 api 实例（关键：让 watchEffect 能追踪 api 从 null → 非 null 的变化） */
const apiRef = shallowRef<any>(null)
let api: any = null  // 保留本地非响应式引用供 onMounted 直接使用

/* 主警情订阅 store 的视角参数（Compass3D 会改 store） */
const store = useModelAssessStore()
const { pitchAngle, rotationAngle } = storeToRefs(store)

onMounted(async () => {
  await nextTick()
  if (!containerRef.value) return
  api = useThreeScene({
    container: containerRef.value,
    mode: props.dataSource,
    masterAlarm: props.masterAlarm,
    realtimeFactors: props.realtimeFactors,
    trappedFloors: props.trappedFloors,
    totalFloors: props.realtimeFactors?.totalFloors,
    buildingHeight: props.realtimeFactors?.buildingHeight,
    interactive: props.interactive,
    routePlan: props.routePlan,
    routeDurationMs: props.routeDurationMs,
    onPickFloor: (f) => emit('pick-floor', f),
    onPickMarker: (u) => emit('pick-marker', u),
    onPickComponent: (i) => emit('pick-component', i),
  })
  api.init()
  // ★ 关键：把 api 同步到 ref，让 watchEffect 能追踪 api 从 null → 非 null 的变化
  apiRef.value = api

  // 加载数据
  if (isMaster) {
    await api.buildCompositeLayer()
    await api.buildVehiclesLayer()
    await api.buildWaterLayer()
    if (props.trappedFloors) api.buildTrappedMarkers(props.trappedFloors)
    if (props.realtimeFactors) {
      api.buildFx(props.realtimeFactors.fireFloor, props.realtimeFactors.smokeLevel)
    }
    // 应用可见图层
    api.toggleLayer('composite', props.visibleLayers.composite)
    api.toggleLayer('vehicles', props.visibleLayers.vehicles)
    api.toggleLayer('water', props.visibleLayers.water)
    // 注册控制器（供 Compass3D / 路线操作栏 调用）
    registerMasterController({
      updatePitchRotation: (p, r) => api?.updatePitchRotation(p, r),
      resetView: () => api?.resetView(),
      replayRouteAnimation: () => api?.replayRouteAnimation(),
      playRouteAnimation: (planData, options) =>
        api?.playRouteAnimation(planData as any, options),
      fitCameraToRoute: () => api?.fitCameraToRoute(),
      startFollowVehicle: () => api?.startFollowVehicle(),
      stopFollowVehicle: () => api?.stopFollowVehicle(),
      isFollowVehicleEnabled: () => api?.isFollowVehicleEnabled() ?? false,
    })
  } else {
    // 相似卡片只显示简化主建筑
    await api.buildCompositeLayer()
  }
  api.state.modelLoaded = true
  emit('model-loaded')
})

onUnmounted(() => {
  if (isMaster) unregisterMasterController()
  api?.dispose()
  api = null
  apiRef.value = null
})

/* ---------- 响应 props 变化（仅主警情） ---------- */
watch(
  () => props.realtimeFactors?.fireFloor,
  (f) => f != null && api?.updateFireFloor(f),
)
watch(
  () => props.realtimeFactors?.smokeLevel,
  (l) => l && api?.updateSmokeLevel(l),
)
watch(
  () => props.trappedFloors,
  (l) => l && api?.updateTrappedMarkers([...l]),
  { deep: true },
)
watch(
  () => props.visibleLayers,
  (v) => {
    if (!v) return
    api?.toggleLayer('composite', v.composite)
    api?.toggleLayer('vehicles', v.vehicles)
    api?.toggleLayer('water', v.water)
  },
  { deep: true },
)

/* ---------- 响应 store 视角参数变化（仅主警情） ---------- */
watch(
  [pitchAngle, rotationAngle],
  ([p, r]) => {
    if (!isMaster || !api) return
    api.updatePitchRotation(p, r)
  },
)

/* ---------- 响应路线数据变化（仅主警情；上游 navPathPlanData 更新时自动重播） ----------
 * 关键：用 apiRef.value（shallowRef）追踪 api 实例化状态。
 *  - 普通 `let api` 不被 watchEffect 追踪，api 从 null → 非 null 不会触发重跑；
 *  - 改用 ref 后，api 初始化完成 → watchEffect 重跑 → 首次播放。
 */
watchEffect(() => {
  if (!isMaster) return
  const api = apiRef.value  // ← 显式读取，纳入依赖追踪
  if (!api) return
  const plan = props.routePlan
  if (!plan || Object.keys(plan).length === 0) return
  api.playRouteAnimation(plan, { durationMs: props.routeDurationMs })
})
</script>

<template>
  <div class="three-viewer" :style="{ height }">
    <div ref="containerRef" class="three-canvas"></div>
    <div v-if="showHUD && isMaster" class="three-hud">
      <span v-if="!api?.state.modelLoaded">⏳ 加载中...</span>
      <span v-else>✓ 模型就绪</span>
    </div>
  </div>
</template>

<style lang="less" scoped>
@import '../styles/three-viewer.less';
</style>
