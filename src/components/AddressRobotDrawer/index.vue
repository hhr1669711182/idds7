<!--
 * @Author: hhr
 * @Date: 2026-09-11
 * @LastEditors: hhr
 * @Description: 地址机器人 - 语义与数据增强 + 地图摘要侧栏
 * @FilePath: \ids-gis-web\src\components\AddressRobotDrawer\index.vue
-->
<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { defaultDataSource } from "./data";
import { type AddressRobotDataSource } from "./types";
import { useAddressDict, hydrateAddressDict } from "./dictSource";
import { EventBus } from "@/utils/index.ts";

const { resolve } = useAddressDict();

const props = withDefaults(defineProps<{ dataSource?: AddressRobotDataSource }>(), {
  dataSource: () => defaultDataSource,
});

const open = ref(false);
const minimized = ref(false);
const close = () => (open.value = false);
const toggleMinimize = () => (minimized.value = !minimized.value);

const gis = ref<any>({});
const osm: any = props.dataSource.loadOsm();

const onGisSearch = (data: any) => {
  gis.value = data;
  osm.value = data;
  open.value = true;
};
onMounted(() => {
  EventBus.on("gis_search", onGisSearch);
  hydrateAddressDict();
  // TODO(huanghuanrong, 2026-12-10, GIS-W46): 抽屉关闭时机待产品确认 —— 暂保留 emit 不接行为 —— 到期未确认则删除 emit
  EventBus.emit("close_address_drawer", close);
});
onBeforeUnmount(() => EventBus.off("gis_search", onGisSearch));

const anchors = computed(() => gis.value.highlight_entities ?? []);
const relations = computed(() => gis.value.spatial_relations ?? []);
const nameById = computed(() => new Map(anchors.value.map((a: any) => [a.anchor_id, a.name])));
const target = computed(() =>
  anchors.value.find((a: any) => a.anchor_id === gis.value.target_anchor_id) ?? anchors.value.find((a: any) => a.highlight_role === "final_anchor") ?? null
);
const primary = computed(() =>
  anchors.value.find((a: any) => a.highlight_role === "context") ?? anchors.value.find((a: any) => a.anchor_id !== target.value?.anchor_id) ?? null
);
const offset = computed<any>(() => relations.value.find((r: any) => r.direction || r.distance) ?? {});
// @ts-expect-error TS6133: 引用处已注释，保留备用
const displayTarget = computed(() => target.value ?? primary.value ?? null);
const directionText = computed(() => resolve("direction", offset.value.direction));
const distanceText = computed(() => (offset.value.distance ? `${offset.value.distance} 米` : "—"));
// @ts-expect-error TS6133: 引用处已注释，保留备用
const relationText = computed(() => relations.value.map((r: any) => resolve("relation", r.relation_type)).join("、 ") || "—");
// @ts-expect-error TS6133: 引用处已注释，保留备用
const sourceText = computed(() => osm?.source || "待查询");
const mapStatus = computed(() => (osm ? resolve("status", osm.status, "部分结果") : "待查询"));
const candidateCount = computed(() => osm?.candidates?.length ?? 0);
</script>

<template>
  <transition name="fade">
    <div v-if="open && !minimized" class="mask" @click.self="close" />
  </transition>

  <transition name="slide">
    <aside v-if="open" :class="['drawer', { min: minimized }]">
      <div v-if="minimized" class="rail" @click="toggleMinimize">
        <div class="rail_dot"></div>
        <div class="rail_text">语义</div>
        <div class="rail_arrow">‹</div>
      </div>

      <template v-else>
        <!-- 头部 -->
        <header class="head">
          <div class="head_top">
            <div class="head_title"><span class="dot"></span><span>语义与数据增强</span></div>
            <div class="head_tools">
              <button class="tool" title="收起" @click="toggleMinimize">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 13H5v-2h14v2z" /></svg>
              </button>
              <button class="tool" title="关闭" @click="close">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z" />
                </svg>
              </button>
            </div>
          </div>
          <div class="head_text"><span class="quote">"</span>{{ gis.raw_text }}<span class="quote">"</span></div>
          <div class="head_conf">
            <span class="conf_lbl">置信</span>
            <span class="conf_val">{{ ((gis.confidence ?? 0) * 100)?.toFixed(1) ?? 0 }}%</span>
            <div class="conf_bar">
              <div class="conf_fill" :style="{ width: Math.min((gis.confidence ?? 0) * 100, 100) + '%' }"></div>
            </div>
          </div>
        </header>

        <!-- 实体锚点 -->
        <section class="block">
          <div class="block_head">
            <span class="block_title">实体锚点</span>
            <span class="block_count">{{ anchors.length }} 个</span>
          </div>
          <div v-if="!anchors.length" class="notice">暂无实体锚点</div>
          <div v-for="item in anchors" :key="item.anchor_id" class="entity">
            <div class="entity_top">
              <div class="entity_name">{{ item.name }}</div>
              <span class="tag tag_blue">{{ resolve('level', item.anchor_level || item.anchor_type, '未分级') }}</span>
            </div>
            <div class="tags">
              <span class="tag">{{ resolve('anchorType', item.anchor_type, '锚点') }}</span>
              <span
                :class="['tag', { tag_green: item.highlight_role === 'final_anchor' }]"
                >{{ resolve('role', item.highlight_role, '辅助锚点') }}</span
              >
              <span v-if="item.anchor_id === gis.target_anchor_id" class="tag tag_amber">地图目标</span>
            </div>
          </div>
        </section>

        <!-- 空间关系 -->
        <section class="block">
          <div class="block_head">
            <span class="block_title">空间关系</span>
            <span class="block_count">{{ relations.length }} 条</span>
          </div>
          <div v-if="!relations.length" class="notice">暂无空间关系。</div>
          <div v-else class="kv-list">
            <div v-for="(item, i) in relations" :key="i" class="kv">
              <div class="kv-k">{{ resolve('relation', item.relation_type, '其他关系') }}</div>
              <div class="kv-v">
                {{ (item.anchor_ids ?? []).map((id: any) => nameById.get(id) || id).join(' 至 ') }}
                <template v-if="item.direction || item.distance">
                  <template v-if="item.direction"
                    >，方向 <span class="rel_dir">{{ resolve('direction', item.direction, '其他方向') }}</span></template
                  >
                  <template v-if="item.direction && item.distance">，</template>
                  <template v-if="item.distance"
                    >距离 <span class="rel_dist">{{ item.distance }} 米</span></template
                  >
                </template>
              </div>
            </div>
          </div>
        </section>

        <!-- 地图摘要 -->
        <section class="block">
          <div class="block_head"><span class="block_title">地图摘要</span></div>
          <div class="grid">
            <!-- <div class="cell"><div class="cell_lbl">目标</div><div class="cell_val">{{ displayTarget?.name || '无' }}</div></div> -->
            <!-- <div class="cell"><div class="cell_lbl">主锚</div><div class="cell_val">{{ primary?.name || '无' }}</div></div> -->
            <div class="cell">
              <div class="cell_lbl">方向</div>
              <div class="cell_val">{{ directionText }}</div>
            </div>
            <div class="cell">
              <div class="cell_lbl">距离</div>
              <div class="cell_val">{{ distanceText }}</div>
            </div>
            <!-- <div class="cell cell_w2"><div class="cell_lbl">地图来源</div><div class="cell_val">{{ sourceText }}</div></div> -->
            <div class="cell">
              <div class="cell_lbl">地图状态</div>
              <div class="cell_val">{{ mapStatus }}</div>
            </div>
            <div class="cell">
              <div class="cell_lbl">候选点</div>
              <div class="cell_val">{{ candidateCount }} 个</div>
            </div>
          </div>
          <!-- <div class="kv-list kv-foot">
            <div class="kv"><div class="kv-k">关系</div><div class="kv-v">{{ relationText }}</div></div>
          </div> -->
        </section>
      </template>
    </aside>
  </transition>
</template>

<style scoped lang="less">
// .mask { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.18); z-index: 49; }

.drawer {
  position: absolute; top: 0; right: 0; bottom: 0;
  width: 360px; z-index: 5000;
  display: flex; flex-direction: column;
  background: var(--panel-bg);
  border-left: 1px solid var(--panel-border);
  box-shadow: var(--panel-shadow);
  color: var(--text-primary);
  backdrop-filter: blur(var(--glass-blur));
  overflow: hidden;
  transition: width 0.25s ease;
}
.drawer.min { width: 36px; overflow: visible; }

@media (max-width: 1280px) { .drawer:not(.min) { width: 320px; } }
@media (max-width: 1024px) { .drawer:not(.min) { width: 290px; } }

/* ============ 窄条 ============ */
.rail {
  width: 36px; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px;
  background: var(--header-bg); color: var(--addr-robot-header-fg);
  cursor: pointer; user-select: none;
  transition: background 0.15s;
  &:hover { background: var(--accent-cyan); }
}
.rail_dot {
  width: 8px; height: 8px; border-radius: 50%; background: var(--addr-robot-dot);
  box-shadow: 0 0 8px var(--addr-robot-dot-glow);
  animation: pulse 1.6s infinite ease-in-out;
}
.rail_text { writing-mode: vertical-rl; font-size: 12px; font-weight: 600; letter-spacing: 4px; margin: 4px 0; }
.rail_arrow { font-size: 16px; font-weight: 700; line-height: 1; }

@keyframes pulse { 0%, 100% { opacity: 0.4; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.1); } }

/* ============ 头部 ============ */
.head {
  padding: 12px 14px;
  background: var(--header-bg);
  color: var(--addr-robot-header-fg);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.head_top { display: flex; justify-content: space-between; align-items: center; }
.head_title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; letter-spacing: 1px; }
.dot {
  width: 8px; height: 8px; border-radius: 50%; background: var(--addr-robot-dot);
  box-shadow: 0 0 8px var(--addr-robot-dot-glow);
  animation: pulse 1.6s infinite ease-in-out;
}
.head_tools { display: flex; gap: 2px; }
.tool {
  width: 24px; height: 24px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; border: none;
  border-radius: 4px; color: var(--addr-robot-header-fg); cursor: pointer;
  transition: background 0.15s;
  &:hover { background: var(--addr-robot-header-surface-hover); }
}
.head_text {
  margin-top: 8px; font-size: 12px; line-height: 1.6;
  background: var(--addr-robot-header-surface);
  border-radius: 6px; padding: 8px 10px;
  color: var(--addr-robot-header-fg-muted);
}
.quote { color: var(--addr-robot-header-fg-subtle); }
.head_conf { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 11px; }
.conf_lbl { color: var(--addr-robot-header-fg-muted); }
.conf_val {
  background: var(--tag-success-bg); color: var(--tag-success-text);
  border: 1px solid var(--tag-success-border);
  padding: 1px 8px; border-radius: 8px;
  font-weight: 700; font-family: Consolas, monospace;
}
.conf_bar { flex: 1; height: 4px; background: var(--addr-robot-header-track); border-radius: 2px; overflow: hidden; }
.conf_fill { height: 100%; border-radius: 2px; background: var(--tag-success-text); transition: width 0.4s; }

/* ============ 块 ============ */
.block { padding: 12px 14px; border-bottom: 1px solid var(--primary-li-bottom-color); overflow-y: auto; flex-shrink: 0; }
.block_head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.block_title { font-size: 13px; font-weight: 700; color: var(--text-primary); letter-spacing: 0.5px; }
.block_count { font-size: 11px; color: var(--text-muted); font-family: Consolas, monospace; }
.notice { font-size: 12px; color: var(--text-muted); padding: 12px 4px; text-align: center; }

.block::-webkit-scrollbar { width: 4px; }
.block::-webkit-scrollbar-thumb { background: var(--primary-li-bottom-color); border-radius: 2px; }
.block::-webkit-scrollbar-thumb:hover { background: var(--accent-cyan-soft); }

/* ============ 实体锚点 ============ */
.entity {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
}
.entity_top { display: flex; justify-content: space-between; align-items: center; }
.entity_name { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.tag {
  font-size: 10px; padding: 1px 8px;
  border-radius: 8px;
  background: var(--widget-bg);
  color: var(--text-secondary);
  border: 1px solid var(--card-border);
}
.tag_blue  { background: var(--tag-primary-bg); color: var(--tag-primary-text); border-color: var(--tag-primary-border); }
.tag_green { background: var(--tag-success-bg); color: var(--tag-success-text); border-color: var(--tag-success-border); }
.tag_amber { background: var(--tag-warning-bg); color: var(--tag-warning-text); border-color: var(--tag-warning-border); }

/* ============ 空间关系 ============ */
.kv-list { display: flex; flex-direction: column; gap: 6px; }
.kv {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex; flex-direction: column; gap: 4px;
}
.kv-k { font-size: 10px; color: var(--text-muted); letter-spacing: 0.5px; }
.kv-v { font-size: 13px; line-height: 1.7; color: var(--text-primary); }
.rel_dir { display: inline-block; background: var(--accent-cyan); color: var(--addr-robot-header-fg); padding: 0 6px; border-radius: 3px; font-weight: 700; }
.rel_dist { font-weight: 700; font-family: Consolas, monospace; color: var(--accent-cyan); }

/* ============ 地图摘要 ============ */
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.cell {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 6px;
  padding: 8px;
  min-height: 56px;
  display: flex; flex-direction: column; justify-content: space-between;
}
.cell_w2 { grid-column: span 2; }
.cell_lbl { font-size: 11px; color: var(--text-muted); }
.cell_val {
  font-size: 13px; font-weight: 600;
  color: var(--text-primary);
  font-family: Consolas, monospace;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
@media (max-width: 1280px) { .grid { grid-template-columns: repeat(2, 1fr); } .cell_w2 { grid-column: span 2; } }
.kv-foot { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--primary-li-bottom-color); }

/* ============ 过渡 ============ */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.slide-enter-from, .slide-leave-to { transform: translateX(100%); }
</style>
