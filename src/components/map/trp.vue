<script setup lang="ts">
import { toRaw, ref, markRaw } from "vue";
import { storeToRefs } from "pinia";
import {
  useCardStore,
  useTopicLayerStore,
  useBaseSourceStore,
  usePanelStore,
  useMapStore,
} from "@/store";
import { useCurrentMap } from "@/composables/useCurrentMap";
import { TYPES, PANEL_TYPES, DRAW_TYPES } from "@/const";
import { useResponsive } from "@/composables/useResponsive.ts";
import { EventBus } from "@/utils/mitt";

const { isMobile } = useResponsive();
const { currentMap: MapInstance } = useCurrentMap();
const cardStore = useCardStore();
const { active } = storeToRefs(cardStore);
const panelStore = usePanelStore();
const topicLayerStore = useTopicLayerStore();
const baseSourceStore = useBaseSourceStore();
const mobileMenuVisible = ref(false);

const handleClickOpIcon = (type: any) => {
   // 移动端关闭菜单
  if (isMobile.value) {
    mobileMenuVisible.value = false;
  }

  // 处理实时路况特殊逻辑
  if (type === TYPES.TRAFFIC) {
    return baseSourceStore.showTrafficSource();
  }

  // 点击已激活的图标，清除绘制工具并关闭弹窗（专题图/图源弹窗随之关闭）
  if (active.value === type && ![TYPES.TRAFFIC, TYPES.RESET].includes(type)) {
    topicLayerStore.setVisible(false);
    baseSourceStore.setVisible(false);
    if (type === TYPES.MEASUREAREA) {
      EventBus.emit("circle-query:close", { uuid: cardStore.drawTool?.uuid });
      panelStore.setPanelType(PANEL_TYPES.NULL);
    }
    return cardStore.clearDrawTool();
  }

  const isDrawType = Object.values(DRAW_TYPES).includes(type);
  if (!isDrawType) {
    cardStore.clearDrawTool();
  }

  active.value = type;
  topicLayerStore.setVisible(false);
  baseSourceStore.setVisible(false);

  switch (type) {
    case TYPES.TRAFFIC:
      baseSourceStore.showTrafficSource();
      break;
    case TYPES.PATHPLAN:
      panelStore.setPanelType(PANEL_TYPES.ROUTE_PLAN);
      break;
    case TYPES.BASESOURCE:
      baseSourceStore.setVisible(true);
      break;
    case TYPES.RESET:
      useMapStore().resetMapView();
      active.value = '';
      break;
    case TYPES.TOPICTYPES:
      topicLayerStore.setVisible(true);
      break;
    default:
      if (isDrawType) {
        cardStore.setMapDrawTool({ drawType: type, map: toRaw(MapInstance.value) as any });
        if (type === TYPES.MEASUREAREA) {
          // 圈选查询:同步打开配置面板,并通过 EventBus 把当前工具的 uuid 广播给面板
          const uuid = cardStore.drawTool?.uuid;
          panelStore.setPanelType(PANEL_TYPES.CIRCLE_QUERY);
          EventBus.emit("circle-query:open", {
            uuid,
            tool: markRaw(cardStore.drawTool),
          });
        }
      }
      break;
  }
};

const menuItems = [
  { text: "图源", icon: "#icon-copy", type: TYPES.BASESOURCE },
  { text: "平移", icon: "#icon-move", type: TYPES.MOVE },
  { text: "复位", icon: "#icon-reset", type: TYPES.RESET },
  { text: "圈选查询", icon: "#icon-compass", type: TYPES.MEASUREAREA },
  { text: "框选放大", icon: "#icon-select-extent", type: TYPES.MEASURELENGTH },
  { text: "标点", icon: "#icon-point", type: TYPES.POINT },
  { text: "标线", icon: "#icon-line", type: TYPES.LINESTRING },
  { text: "标面", icon: "#icon-polygon", type: TYPES.POLYGON },
  { text: "画圆", icon: "#icon-circle", type: TYPES.CIRCLE },
  { text: "画矩形", icon: "#icon-rect", type: TYPES.RECT },
  { text: "测距", icon: "#icon-measure-distance", type: TYPES.MEASUREDISTANCE },
  { text: "量角", icon: "#icon-protractor", type: TYPES.MEASUREANGLE },
  { text: "方位角", icon: "#icon-azimuth", type: TYPES.AZIMUTH },
  { text: "测面", icon: "#icon-measure-polygon", type: TYPES.MEASUREPOLYGON },
  // { text: "路径规划", icon: "#icon-route", type: TYPES.PATHPLAN },
  { text: "实时路况", icon: "#icon-traffic-rounded", type: TYPES.TRAFFIC },
  { text: "实时人口标绘", icon: "#icon-population", type: TYPES.POPULATION },
  // { text: "专题图", icon: "#icon-topic-layers", type: TYPES.TOPICTYPES },
] as const;

const mobileMenuGroups = computed(() => {
  return [
    {
      title: "绘图工具",
      items: menuItems.slice(0, 5),
    },
    {
      title: "测量工具",
      items: menuItems.slice(5, 9),
    },
    {
      title: "其他功能",
      items: menuItems.slice(9),
    },
  ];
});
</script>

<template>
  <ul v-if="!isMobile" class="Draw_draw__UPVhb">
    <li
      :class="{ active: active == item.type || (item.type === TYPES.TRAFFIC && baseSourceStore.trafficVisible) }"
      v-for="item in menuItems"
      @click="() => handleClickOpIcon(item.type)"
    >
      <el-tooltip
        class="box-item"
        effect="dark"
        :content="item.text"
        placement="left"
        :offset="20"
      >
        <span v-if="item.icon.startsWith('#icon')" role="img" class="anticon">
          <svg
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
            class=""
          >
            <use :xlink:href="item.icon"></use>
          </svg>
        </span>

        <Icon v-else :icon="item.icon" :size="22" />
      </el-tooltip>
    </li>
  </ul>

  <div v-else class="mobile-toolbar">
    <div class="menu-toggle" @click="mobileMenuVisible = !mobileMenuVisible">
      <span class="menu-icon">
        <svg width="20" height="20" aria-hidden="true" focusable="false">
          <use xlink:href="#icon-menu"></use>
        </svg>
      </span>
      <span class="menu-text">工具菜单</span>
    </div>
    <div v-if="mobileMenuVisible" class="mobile-menu-panel">
      <div class="menu-header">
        <h3>地图工具</h3>
        <span class="close-btn" @click="mobileMenuVisible = false">
          <svg width="20" height="20" aria-hidden="true" focusable="false">
            <use xlink:href="#icon-close"></use>
          </svg>
        </span>
      </div>
      <div class="menu-content">
        <div v-for="group in mobileMenuGroups" :key="group.title" class="menu-group">
          <p class="group-title">{{ group.title }}</p>
          <div class="group-items">
            <div
              v-for="item in group.items"
              :key="item.type"
              class="menu-item"
              :class="{ active: active == item.type }"
              @click="() => handleClickOpIcon(item.type)"
            >
              <span class="item-icon">
                <svg
                  width="24"
                  height="24"
                  aria-hidden="true"
                  focusable="false"
                >
                  <use :xlink:href="item.icon"></use>
                </svg>
              </span>
              <span class="item-text">{{ item.text }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
ul {
  border-radius: 6px;
  box-shadow: 0 0 4px 2px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--panel-border);
  position: absolute;
  right: 10px;
  top: 65px;
  z-index: 5;
}

li {
  background-color: var(--primary-color);
  /* 部分图标使用 fill/stroke="currentColor"，需让 color 也跟随主题，夜间变白 */
  color: var(--primary-svg-color);
  font-size: 22px;
  height: 32px;
  transition: all 0.3s;
  width: 32px;
  align-items: center;
  display: flex;
  justify-content: center;
}

li svg {
  fill: var(--primary-svg-color);
}

ul > li:not(:last-child) {
  border-bottom: 1px solid var(--primary-li-bottom-color);
}

.Draw_draw__UPVhb > li:first-child,
.Draw_draw__UPVhb > li:last-child {
  font-size: 26px;
}

.anticon {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  align-items: center;
  color: inherit;
  display: inline-flex;
  font-style: normal;
  line-height: 0;
  text-align: center;
  text-rendering: optimizelegibility;
  text-transform: none;
  vertical-align: -0.125em;
  font-size: 22px;
}

.anticon > * {
  line-height: 1;
}

.anticon svg {
  display: inline-block;
}

li:hover {
  background-color: var(--primary-svg-hover-color);
  cursor: pointer;
}

ul > li.active {
  color: var(--accent-cyan);
}

ul > li.active svg {
  fill: var(--accent-cyan) !important;
}

html[data-theme="NIGHT"] {
  ul {
    background: var(--primary-color);
    border-color: var(--widget-border);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }
  li:hover {
    background-color: var(--hover-bg);
  }
  ul > li.active {
    color: var(--active-border);
  }
  ul > li.active svg {
    fill: var(--active-border) !important;
  }
}

.mobile-toolbar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: var(--panel-bg);
  border-top: 1px solid var(--panel-border);
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.15);
  color: var(--text-primary);
}

.menu-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  cursor: pointer;
  border-top: 1px solid var(--accent-cyan-soft);
}

.menu-icon {
  margin-right: 8px;
}

.menu-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
}

.mobile-menu-panel {
  position: fixed;
  bottom: 60px;
  left: 0;
  right: 0;
  background: var(--panel-bg);
  border-top: 1px solid var(--panel-border);
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -2px 20px rgba(0, 0, 0, 0.15);
  max-height: 70vh;
  overflow-y: auto;
  animation: slide-up 0.3s ease;
  color: var(--text-primary);
}

@keyframes slide-up {
  from {
    transform: translateY(100%);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--accent-cyan-soft);
}

.menu-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  cursor: pointer;
  padding: 4px;
}

.menu-content {
  padding: 16px;
}

.menu-group {
  margin-bottom: 24px;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  margin: 0 0 12px 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.group-items {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.menu-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  border-radius: 8px;
  transition: background-color 0.2s;
  cursor: pointer;
}

.menu-item:hover {
  background-color: var(--hover-bg);
}

.menu-item.active {
  background-color: var(--active-bg);
  border: 1px solid var(--active-border);
}

.item-icon {
  margin-bottom: 8px;
}

.item-icon svg {
  fill: var(--primary-svg-color);
}

.menu-item.active .item-icon svg {
  fill: var(--active-text);
}

.item-text {
  font-size: 12px;
  color: var(--text-primary);
  text-align: center;
  line-height: 1.2;
}

.menu-item.active .item-text {
  color: var(--active-text);
  font-weight: 500;
}

@media (max-width: 480px) {
  .group-items {
    grid-template-columns: repeat(3, 1fr);
  }

  .menu-item {
    padding: 10px 6px;
  }

  .item-text {
    font-size: 11px;
  }
}
</style>
