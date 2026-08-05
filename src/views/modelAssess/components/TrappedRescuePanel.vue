<!--
  @Description: 高空受困救援布控面板（与 3D 视图双向交互）
  @FilePath: \ids-gis-web\src\views\modelAssess\components\TrappedRescuePanel.vue
-->
<script setup lang="ts">
import { reactive, ref, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useModelAssessStore } from '@/store/useModelAssessStore'
import { TRAPPED_DIRS } from '@/const/const.modelAssess'

const store = useModelAssessStore()
const { trappedFloors, trappedTotal, selectedTrappedUuid } = storeToRefs(store)

const form = reactive({
  floor: 15,
  direction: TRAPPED_DIRS[0],
  count: 1,
})

const listEl = ref<HTMLElement | null>(null)

const onAdd = () => {
  if (form.count <= 0) return
  store.addTrappedFloor({
    floor: form.floor,
    direction: form.direction,
    count: form.count,
  })
}

const onInc = (uuid: string) => store.adjustTrappedCount(uuid, 1)
const onDec = (uuid: string) => store.adjustTrappedCount(uuid, -1)
const onDel = (uuid: string) => {
  if (selectedTrappedUuid.value === uuid) store.clearSelectedTrapped()
  store.removeTrappedFloor(uuid)
}

/** 点击列表项 -> 高亮 3D 中对应的受困标牌 */
const onPickRow = (uuid: string) => {
  store.selectTrappedFloor(uuid)
  // 滚动到可视区
  nextTick(() => {
    const el = listEl.value?.querySelector(`[data-uuid="${uuid}"]`) as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}
</script>

<template>
  <div class="ma-panel rescue-panel">
    <div class="ma-panel-header">
      <div class="ma-panel-title">
        <span class="dot"></span>
        高空受困救援布控
      </div>
      <span style="color: #8a96b0; font-size: 11px">实时同步</span>
    </div>

    <div class="ma-panel-body" style="padding: 8px 12px 4px; color: #8a96b0; font-size: 11px">
      ▸ 已知受困楼层（CRUD / 3D 联动）
    </div>
    <div ref="listEl" class="trapped-list">
      <div
        v-for="t in trappedFloors"
        :key="t.uuid"
        :data-uuid="t.uuid"
        :class="['trapped-item', { active: t.uuid === selectedTrappedUuid }]"
        @click="onPickRow(t.uuid)"
      >
        <span class="floor">{{ t.floor }}F</span>
        <span class="dir">{{ t.direction }}</span>
        <div class="count-ctrl">
          <button @click.stop="onDec(t.uuid)">−</button>
          <span class="num">{{ t.count }}</span>
          <button @click.stop="onInc(t.uuid)">+</button>
        </div>
        <button class="del" @click.stop="onDel(t.uuid)" title="删除">✕</button>
      </div>
    </div>

    <div class="ma-panel-body" style="padding: 4px 12px; color: #8a96b0; font-size: 11px; border-top: 1px solid #1f2940">
      ▸ 新增受困楼层
    </div>
    <div class="add-form">
      <input v-model.number="form.floor" type="number" min="1" placeholder="楼层" />
      <select v-model="form.direction">
        <option v-for="d in TRAPPED_DIRS" :key="d" :value="d">{{ d }}</option>
      </select>
      <input v-model.number="form.count" type="number" min="1" placeholder="人数" />
      <button class="add-btn" @click="onAdd" title="添加">+</button>
    </div>

    <div class="total">
      <span>📊 总计</span>
      <span class="num">{{ trappedTotal }} 人</span>
    </div>
    <div class="sync-hint">✓ 已同步至总受困人数</div>
  </div>
</template>

<style lang="less" scoped>
@import '../styles/model-assess.less';

.trapped-item {
  cursor: pointer;
  transition: all 0.2s;
}

.trapped-item:hover {
  background: #1a2236;
  border-color: #2a3556;
}

.trapped-item.active {
  background: rgba(255, 122, 0, 0.18);
  border-color: #ff7a00;
  box-shadow: 0 0 8px rgba(255, 122, 0, 0.4);
}
</style>
