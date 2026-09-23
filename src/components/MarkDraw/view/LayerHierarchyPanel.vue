<script setup lang="ts">
/**
 * 三级面板：group → layer
 * - 一级 group（玻璃列表）
 * - 二级 layer（玻璃列表）
 * - 选中 layer → 上报；自动上图 + 列表
 */
import { computed } from "vue";
import { useMarkDrawStore } from "../store/useMarkDrawStore";
import { useLayerHierarchy } from "./useLayerHierarchy";
import { MdTag } from "../ui";
import type { MarkDrawLayer } from "../engine/types";

const store = useMarkDrawStore();
const { groups, getLayers } = useLayerHierarchy();

const activeGroup = computed(() => store.activeGroupId);
const activeLayer = computed(() => store.activeLayerId);
const layersOf = (groupId: string) => getLayers(groupId);

const pickGroup = (id: string) => {
  store.activeGroupId = id;
  const layers = getLayers(id);
  if (layers.length && !layers.find((l) => l.id === activeLayer.value)) {
    const first = layers[0];
    store.activeLayerId = first.id;
    emit("layer-selected", first);
  }
};

const pickLayer = (layer: MarkDrawLayer) => {
  store.activeLayerId = layer.id;
  store.activeGroupId = layer.groupId;
  emit("layer-selected", layer);
};

const emit = defineEmits<{
  (e: "layer-selected", layer: MarkDrawLayer): void;
}>();
</script>

<template>
  <section class="md-card md-hierarchy">
    <header class="md-card__head">
      <span class="md-card__bar" />
      <span class="md-card__title">三级视图</span>
      <span class="md-hierarchy__hint">group → layer</span>
    </header>
    <div class="md-hierarchy__grid">
      <aside class="md-hierarchy__col">
        <div class="md-hierarchy__col-title">分组</div>
        <ul class="md-list">
          <li
            v-for="g in groups"
            :key="g.groupId"
            :class="{ active: activeGroup === g.groupId }"
            @click="pickGroup(g.groupId)"
          >
            <span class="md-list__dot" />
            <span class="md-list__name">{{ g.groupName }}</span>
            <span class="md-list__count">{{ layersOf(g.groupId).length }}</span>
          </li>
        </ul>
      </aside>
      <div class="md-hierarchy__col md-hierarchy__col--layers">
        <div class="md-hierarchy__col-title">图层</div>
        <ul class="md-list md-list--layers">
          <li
            v-for="l in layersOf(activeGroup)"
            :key="l.id"
            :class="{ active: activeLayer === l.id }"
            @click="pickLayer(l)"
          >
            <span class="md-list__name">{{ l.name }}</span>
            <MdTag v-if="l.writable" variant="success" size="sm">可写</MdTag>
            <MdTag v-else variant="info" size="sm">只读</MdTag>
            <span class="md-list__id">{{ l.id }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.md-hierarchy__hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--md-text-3);
  letter-spacing: 0.4px;
}
.md-hierarchy__grid {
  display: grid;
  grid-template-columns: 124px 1fr;
  gap: 10px;
}
.md-hierarchy__col-title {
  font-size: 11px;
  color: var(--md-text-3);
  margin-bottom: 6px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.md-list {
  margin: 0;
  padding: 4px;
  list-style: none;
  background: rgba(10, 18, 32, 0.4);
  border: 1px solid var(--md-border);
  border-radius: var(--md-radius-sm);
  max-height: 220px;
  overflow-y: auto;
}
:root:not([data-theme="NIGHT"]) .md-list {
  background: rgba(255, 255, 255, 0.4);
}
.md-list--layers {
  max-height: 220px;
}
.md-list li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  margin-bottom: 2px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.16s ease;
  border: 1px solid transparent;
  position: relative;
}
.md-list li:hover {
  background: rgba(0, 212, 255, 0.08);
  color: var(--md-accent-1);
}
:root:not([data-theme="NIGHT"]) .md-list li:hover {
  background: rgba(15, 124, 255, 0.08);
}
.md-list li.active {
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.22), rgba(77, 171, 247, 0.22));
  border-color: var(--md-border-strong);
  color: #fff;
  font-weight: 600;
  box-shadow: inset 0 0 8px rgba(0, 212, 255, 0.18);
}
:root:not([data-theme="NIGHT"]) .md-list li.active {
  color: var(--md-accent-2);
  background: linear-gradient(135deg, rgba(15, 124, 255, 0.15), rgba(45, 109, 214, 0.15));
}
.md-list__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--md-accent-1);
  box-shadow: 0 0 6px var(--md-accent-glow);
  flex-shrink: 0;
}
.md-list__name {
  flex: 1;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-list__count {
  font-size: 11px;
  color: var(--md-text-3);
  background: rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 0 6px;
  height: 16px;
  display: inline-flex;
  align-items: center;
}
.md-list__id {
  font-size: 10px;
  color: var(--md-text-3);
  font-family: monospace;
  margin-left: 4px;
}
</style>
