/*
 * @Description: 模型研判（2.5D 指挥大屏）独立 Pinia store
 * @FilePath: \ids-gis-web\src\store\useModelAssessStore.ts
 */
import { defineStore } from 'pinia'
import { reactive, toRefs, computed } from 'vue'
import type {
  SimilarAlarmCardItem,
  MasterAlarm,
  RealtimeFactors,
  TrappedFloorItem,
} from '@/const/const.modelAssess'
import type { LayerTabKey } from '@/const/const.modelAssess'
import {
  SIMILAR_CARDS_MOCK,
  MASTER_ALARM_MOCK,
  TRAPPED_FLOORS_MOCK,
} from '@/views/modelAssess/mock'

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const useModelAssessStore = defineStore('modelAssessStore', () => {
  /* ---------------------- state ---------------------- */
  const state = reactive({
    /** 顶部 4 张相似警情卡片 */
    similarCards: [...SIMILAR_CARDS_MOCK.sort((a,b) => b.similarity - a.similarity)] as SimilarAlarmCardItem[],
    /** 主警情（COMMAND MASTER） */
    masterAlarm: { ...MASTER_ALARM_MOCK } as MasterAlarm,
    /** 实时要素判研（可编辑） */
    realtimeFactors: {
      totalFloors: 32,
      buildingHeight: 96,
      fireFloor: 15,
      fireHeight: 45,
      trappedPeople: 15,
      smokeLevel: '中度 (Medium)',
    } as RealtimeFactors,
    /** 受困楼层（增删改查） */
    trappedFloors: [...TRAPPED_FLOORS_MOCK] as TrappedFloorItem[],
    /** 顶部图层切换 */
    activeLayerTab: 'composite' as LayerTabKey,
    /** 三维视角（默认与 maModelSetting.cameraInit = (4,4,4) 对应：pitch≈35, rotation=45） */
    pitchAngle: 35,
    rotationAngle: 45,
    /** 同步状态（保存修改后 1.5s 内显示"已同步"） */
    saveHint: '',
    /** 3D 视图相关：模型加载状态 */
    modelLoaded: false,
    /** 3D 视图中当前选中的受困人员标牌 uuid（双向交互） */
    selectedTrappedUuid: '' as string,
    /** 3D 视图中当前选中的楼层（点击楼层时设置） */
    selectedFloor: 0,
    /** 当前弹窗展示的构件详情（来自 ThreeViewer pick-component 事件） */
    selectedComponent: null as null | {
      type: 'floor' | 'trappedPerson' | 'hydrant' | 'fireTruck' | 'fireFighter'
      uuid?: string
      floor?: number
      name?: string
      count?: number
      direction?: string
    },
    /** 2D 俯视平面图模式开关（true=平面图，false=3D 视图） */
    plan2DMode: false,
  })

  /* ---------------------- computed ---------------------- */
  const trappedTotal = computed(() =>
    state.trappedFloors.reduce((sum, item) => sum + (item.count || 0), 0),
  )

  const similarCount = computed(() => state.similarCards.length)

  /* ---------------------- 相似警情卡片 CRUD ---------------------- */
  const addSimilarCard = (card: Omit<SimilarAlarmCardItem, 'id'> & { id?: string }) => {
    const id = card.id || `S-${uid()}`
    state.similarCards.push({ ...card, id })
    return id
  }

  const removeSimilarCard = (id: string) => {
    const idx = state.similarCards.findIndex((c) => c.id === id)
    if (idx >= 0) state.similarCards.splice(idx, 1)
  }

  const updateSimilarCard = (id: string, patch: Partial<SimilarAlarmCardItem>) => {
    const card = state.similarCards.find((c) => c.id === id)
    if (card) Object.assign(card, patch)
  }

  /** 将某个相似卡片合并到主警情（mock：把建筑名称合并到 masterAlarm） */
  const mergeToMaster = (id: string) => {
    const card = state.similarCards.find((c) => c.id === id)
    if (!card) return
    // mock 行为：在建筑名称后追加合并标记
    state.masterAlarm = {
      ...state.masterAlarm,
      buildingName: `${state.masterAlarm.buildingName} / 合并自 ${card.buildingName}`,
      address: card.address || state.masterAlarm.address,
    }
    // 合并后移除该卡片
    removeSimilarCard(id)
    state.saveHint = `已合并「${card.buildingName}」到主警情`
    setTimeout(() => (state.saveHint = ''), 2000)
  }

  /* ---------------------- 实时要素判研 ---------------------- */
  const updateFactor = <K extends keyof RealtimeFactors>(
    key: K,
    value: RealtimeFactors[K],
  ) => {
    state.realtimeFactors[key] = value
  }

  const saveRealtimeFactors = () => {
    // 同步到主警情
    state.masterAlarm.totalFloors = state.realtimeFactors.totalFloors
    state.masterAlarm.buildingHeight = state.realtimeFactors.buildingHeight
    state.masterAlarm.fireFloor = state.realtimeFactors.fireFloor
    state.masterAlarm.fireHeight = state.realtimeFactors.fireHeight
    state.realtimeFactors.trappedPeople = trappedTotal.value
    state.saveHint = '已保存修改，已同步至主警情'
    setTimeout(() => (state.saveHint = ''), 2000)
  }

  /* ---------------------- 受困楼层 CRUD ---------------------- */
  const addTrappedFloor = (item: Omit<TrappedFloorItem, 'uuid'>) => {
    const uuid = `T-${uid()}`
    state.trappedFloors.push({ ...item, uuid })
    // 同步受困总数
    state.realtimeFactors.trappedPeople = trappedTotal.value
    return uuid
  }

  const removeTrappedFloor = (uuid: string) => {
    const idx = state.trappedFloors.findIndex((t) => t.uuid === uuid)
    if (idx >= 0) state.trappedFloors.splice(idx, 1)
    state.realtimeFactors.trappedPeople = trappedTotal.value
  }

  const updateTrappedFloor = (uuid: string, patch: Partial<TrappedFloorItem>) => {
    const item = state.trappedFloors.find((t) => t.uuid === uuid)
    if (item) Object.assign(item, patch)
    state.realtimeFactors.trappedPeople = trappedTotal.value
  }

  const adjustTrappedCount = (uuid: string, delta: number) => {
    const item = state.trappedFloors.find((t) => t.uuid === uuid)
    if (item) {
      item.count = Math.max(0, item.count + delta)
      state.realtimeFactors.trappedPeople = trappedTotal.value
    }
  }

  const syncTrappedTotal = () => {
    state.realtimeFactors.trappedPeople = trappedTotal.value
  }

  /* ---------------------- UI 状态 ---------------------- */
  const setActiveLayerTab = (tab: LayerTabKey) => {
    state.activeLayerTab = tab
  }

  const setPitchAngle = (v: number) => {
    state.pitchAngle = v
  }

  const setRotationAngle = (v: number) => {
    state.rotationAngle = v
  }

  const resetView = () => {
    state.pitchAngle = 35
    state.rotationAngle = 45
  }

  /* ---------------------- 3D 视图相关 actions ---------------------- */
  const setModelLoaded = (v: boolean) => {
    state.modelLoaded = v
  }

  const selectTrappedFloor = (uuid: string) => {
    state.selectedTrappedUuid = uuid
  }

  const clearSelectedTrapped = () => {
    state.selectedTrappedUuid = ''
  }

  /** 选中楼层（3D 视图点击楼层时调用），同时回填起火楼层到判研面板 */
  const pickFloor = (floor: number) => {
    state.selectedFloor = floor
    if (floor >= 1 && floor <= state.realtimeFactors.totalFloors) {
      state.realtimeFactors.fireFloor = floor
    }
  }

  /**
   * 定位到 3D 视图（强制切换 plan2DMode = false + 选中目标楼层）
   * 供外部"📍 3D 定位"按钮 / 弹窗"定位到 3D 视图"使用。
   * - 若当前在 2D 平面图：自动切回 3D
   * - 若目标楼层有起火风险：同步写入 realtimeFactors.fireFloor
   */
  const locateFloorIn3D = (floor: number) => {
    state.plan2DMode = false
    pickFloor(floor)
  }

  /** 定位到当前起火层（在 MasterAlarmPanel 的"📍 3D 定位"按钮使用） */
  const locateFireFloorIn3D = () => {
    locateFloorIn3D(state.realtimeFactors.fireFloor)
  }

  /* ---------------------- 弹窗 / 2D 模式 ---------------------- */
  const setSelectedComponent = (info: typeof state.selectedComponent) => {
    state.selectedComponent = info
  }
  const clearSelectedComponent = () => {
    state.selectedComponent = null
  }
  const setPlan2DMode = (v: boolean) => {
    state.plan2DMode = v
  }
  const togglePlan2D = () => {
    state.plan2DMode = !state.plan2DMode
  }

  return {
    ...toRefs(state),
    // computed
    trappedTotal,
    similarCount,
    // 相似警情 CRUD
    addSimilarCard,
    removeSimilarCard,
    updateSimilarCard,
    mergeToMaster,
    // 实时要素
    updateFactor,
    saveRealtimeFactors,
    // 受困楼层 CRUD
    addTrappedFloor,
    removeTrappedFloor,
    updateTrappedFloor,
    adjustTrappedCount,
    syncTrappedTotal,
    // UI
    setActiveLayerTab,
    setPitchAngle,
    setRotationAngle,
    resetView,
    // 3D 视图
    setModelLoaded,
    selectTrappedFloor,
    clearSelectedTrapped,
    pickFloor,
    locateFloorIn3D,
    locateFireFloorIn3D,
    // 弹窗 / 2D
    setSelectedComponent,
    clearSelectedComponent,
    setPlan2DMode,
    togglePlan2D,
  }
})
