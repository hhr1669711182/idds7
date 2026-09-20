<script setup lang="ts">
import { storeToRefs } from "pinia";

import { BASE_SOURCE_GROUPS } from "@/baseComponent/OpenlayersMap/baseSource.ts";
import { useBaseSourceStore } from "@/store";
import { useCurrentMap } from "@/composables/useCurrentMap";

const { currentMap: MapInstance } = useCurrentMap();

const baseSourceStore = useBaseSourceStore();
const { visible, activeId } = storeToRefs(baseSourceStore);

const hideCard = () => {
  baseSourceStore.setVisible(false);
};

const selectSource = (id: string) => {
  baseSourceStore.setActiveId(id);
};
</script>

<template>
  <div class="base_source_panel" v-if="visible">
    <div class="card_header">
      <span>图源选择</span>
      <span
        role="img"
        tabindex="-1"
        class="anticon Head_close__0vFMi"
        @click="hideCard"
      >
        <svg
          width="1em"
          height="1em"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
          class=""
        >
          <use xlink:href="#icon-close"></use>
        </svg>
      </span>
    </div>

    <div class="card_body">
      <div class="container">
        <div class="base_source_list">
          <el-card
            v-for="group in BASE_SOURCE_GROUPS"
            :key="group.providerId"
            class="source_card"
            shadow="hover"
          >
            <template #header>
              <div class="card_source_header">
                <span>{{ group.providerName }}</span>
              </div>
            </template>

            <div class="source_variants">
              <button
                v-for="option in group.options"
                :key="option.id"
                type="button"
                class="source_variant"
                :class="{ active: activeId === option.id }"
                @click="selectSource(option.id)"
              >
                <span
                  class="variant_preview"
                  :class="[
                    `variant_preview--${option.mode}`,
                    `variant_preview--${group.providerId}`,
                  ]"
                />
                <span class="variant_name">{{ option.label }}</span>
              </button>
            </div>
          </el-card>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.base_source_panel {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: var(--panel-shadow);
  min-height: 200px;
  position: absolute;
  right: 70px;
  top: 100px;
  width: 660px;
  z-index: 6;
  color: var(--text-primary);
}

.card_header {
  background: var(--header-bg);
  color: var(--header-text);
  font-size: 16px;
  justify-content: space-between;
  line-height: 45px;
  padding: 0 20px;
  display: flex;
  align-items: center;
}

.card_body {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: auto;
  min-height: 200px;
  max-height: calc(100vh - 190px);

  &:hover {
    overflow-y: auto;
  }

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.container {
  position: relative;
  overflow: auto;
  margin-right: -17px;
  margin-bottom: -17px;
  min-height: 217px;
  max-height: calc(100vh - 173px);
}

.base_source_list {
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.source_card {
  width: 100%;
}

.card_source_header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: default;
}

.source_variants {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.source_variant {
  display: grid;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.source_variant:hover {
  border-color: var(--hover-border);
  box-shadow: 0 4px 12px rgba(51, 133, 255, 0.12);
  transform: translateY(-1px);
}

.source_variant.active {
  border-color: var(--active-border);
  box-shadow: 0 0 0 1px var(--active-border);
}

.variant_preview {
  position: relative;
  display: block;
  height: 74px;
  border-radius: 4px;
  overflow: hidden;
}

.variant_preview::before,
.variant_preview::after {
  content: "";
  position: absolute;
  inset: 0;
}

.variant_preview--image {
  background:
    linear-gradient(
      135deg,
      rgba(15, 23, 42, 0.92),
      rgba(15, 118, 110, 0.42) 45%,
      rgba(59, 130, 246, 0.38)
    ),
    repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.1) 0 1px,
      transparent 1px 12px
    ),
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.08) 0 1px,
      transparent 1px 14px
    );
}

.variant_preview--road {
  background:
    linear-gradient(180deg, #f8fafc 0%, #dbe4f0 100%),
    repeating-linear-gradient(
      90deg,
      rgba(51, 133, 255, 0.12) 0 2px,
      transparent 2px 20px
    ),
    repeating-linear-gradient(
      0deg,
      rgba(148, 163, 184, 0.16) 0 1px,
      transparent 1px 16px
    );
}

.variant_preview--amap::before,
.variant_preview--google::before {
  background:
    radial-gradient(
      circle at 20% 30%,
      rgba(255, 255, 255, 0.18) 0 12px,
      transparent 13px
    ),
    radial-gradient(
      circle at 72% 62%,
      rgba(255, 255, 255, 0.14) 0 10px,
      transparent 11px
    );
  mix-blend-mode: screen;
}

.variant_preview--baidu::before {
  background:
    linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(59, 130, 246, 0.14)),
    repeating-linear-gradient(
      45deg,
      rgba(255, 255, 255, 0.16) 0 6px,
      transparent 6px 12px
    );
}

.variant_preview--tianditu::before {
  background:
    linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(34, 197, 94, 0.16)),
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.2) 0 1px,
      transparent 1px 18px
    );
}

.variant_preview--kailide::before,
.variant_preview--offline::before,
.variant_preview--local::before {
  background:
    linear-gradient(135deg, rgba(75, 85, 99, 0.15), rgba(96, 165, 250, 0.22)),
    repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.18) 0 1px,
      transparent 1px 10px
    );
}

.variant_name {
  font-size: 12px;
  line-height: 1.2;
  color: var(--text-secondary);
  text-align: center;
}

.source_variant.active .variant_name {
  color: var(--accent-gold);
  font-weight: 600;
}

.Head_close__0vFMi {
  cursor: pointer;
  color: var(--header-text);
}

:deep(.el-card__body) {
  padding: 10px;
}

:deep(.el-card__header) {
  padding: 6px 12px;
}

.source_card.active {
  color: var(--active-border);
  border-color: var(--active-border);
}

html[data-theme="NIGHT"] {
  .source_card {
    :deep(.el-card) {
      background: var(--card-box-bg);
      border-color: var(--card-box-border);
      color: var(--text-primary);
    }
    :deep(.el-card__header) {
      border-bottom-color: var(--card-border);
      color: var(--text-secondary);
      background: var(--card-bg);
    }
    :deep(.el-card__body) {
      background: var(--card-bg);
      padding: 10px;
    }
  }
  .source_card.active {
    :deep(.el-card) {
      border-color: var(--active-border);
    }
  }
  .variant_preview--road {
    background:
      linear-gradient(180deg, #1a1f2e 0%, #2d3548 100%),
      repeating-linear-gradient(
        90deg,
        rgba(120, 160, 220, 0.18) 0 2px,
        transparent 2px 20px
      ),
      repeating-linear-gradient(
        0deg,
        rgba(148, 163, 184, 0.22) 0 1px,
        transparent 1px 16px
      );
  }
}

@media (max-width: 980px) {
  .base_source_panel {
    width: min(92vw, 760px);
  }
}

@media (max-width: 720px) {
  .base_source_list {
    grid-template-columns: 1fr;
  }

  .source_variants {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 520px) {
  .source_variants {
    grid-template-columns: 1fr;
  }
}
</style>
