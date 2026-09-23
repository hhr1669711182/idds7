<script setup lang="ts">
/**
 * 圈选查询统计面板（玻璃风格自写）
 */
import { ref, onMounted, onBeforeUnmount } from "vue";
import { MdTag } from "../ui";
import type { CreateMarkDrawEngineResult } from "../engine/createMarkDrawEngine";
import type { CircleQueryPayload } from "../engine/types";

const props = defineProps<{
  engine: CreateMarkDrawEngineResult | null;
}>();

const last = ref<CircleQueryPayload | null>(null);

const onResult = (payload: CircleQueryPayload) => {
  last.value = payload;
};

onMounted(() => {
  props.engine?.on("circle-query:result", onResult as never);
});
onBeforeUnmount(() => {
  props.engine?.off("circle-query:result", onResult as never);
});

const formatRadius = (m: number) => (m > 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(0)} m`);
const formatCoord = (c: [number, number]) => `${c[0].toFixed(5)}, ${c[1].toFixed(5)}`;
const perLayerEntries = () => Object.entries(last.value?.perLayer ?? {});
</script>

<template>
  <section v-if="last" class="md-card md-cq">
    <header class="md-card__head">
      <span class="md-card__bar" />
      <span class="md-card__title">圈选查询结果</span>
      <MdTag :variant="last.total > 0 ? 'success' : 'info'">{{ last.total }} 条</MdTag>
    </header>
    <div class="md-cq__grid">
      <div class="md-cq__row">
        <span class="md-cq__k">中心经纬度</span>
        <span class="md-cq__v">{{ formatCoord(last.centerLngLat) }}</span>
      </div>
      <div class="md-cq__row">
        <span class="md-cq__k">半径</span>
        <span class="md-cq__v">{{ formatRadius(last.radiusMeters) }}</span>
      </div>
      <div class="md-cq__row">
        <span class="md-cq__k">当前图层</span>
        <span class="md-cq__v">{{ last.layer?.name ?? '（无可写图层）' }}</span>
      </div>
      <div v-if="perLayerEntries().length" class="md-cq__row md-cq__row--col">
        <span class="md-cq__k">分图层命中</span>
        <ul class="md-cq__list">
          <li v-for="[id, n] in perLayerEntries()" :key="id">
            <span class="md-cq__list-name">{{ id }}</span>
            <MdTag variant="primary" size="sm">{{ n }}</MdTag>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.md-cq__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}
.md-cq__row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.md-cq__row--col {
  grid-column: 1 / -1;
}
.md-cq__k {
  font-size: 11px;
  color: var(--md-text-3);
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.md-cq__v {
  font-size: 13px;
  color: var(--md-text);
  font-weight: 500;
}
.md-cq__list {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.md-cq__list li {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(0, 212, 255, 0.08);
  border: 1px solid var(--md-border);
}
:root:not([data-theme="NIGHT"]) .md-cq__list li {
  background: rgba(15, 124, 255, 0.06);
}
.md-cq__list-name {
  font-size: 11px;
  color: var(--md-text-2);
}
</style>
