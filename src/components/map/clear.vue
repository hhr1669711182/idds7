<script setup lang="ts">
import { PANEL_MAP_TYPE } from "../../const/index.ts";
import { LAYER_NAMES } from "../../baseComponent/OpenlayersMap/layers.ts";
import { MODAL_SETTING } from "../../const/const.modals.ts";
import { useModalStore, usePanelStore, useCardStore } from "../../store/index";
import { useCurrentMap } from "@/composables/useCurrentMap";

const { currentMap: MapInstance }: any = useCurrentMap();

const modalStore = useModalStore();

const panelStore = usePanelStore();

const cardStore: any = useCardStore();

const handleClear = () => {
  const layers = MapInstance.value
    .getLayers()
    .getArray();


    const vectorLayer = layers.find(
      (i: { getClassName: () => string }) =>
        i.getClassName() == LAYER_NAMES.VECTOR_LAYER
    );

    vectorLayer && vectorLayer.getSource().clear();

    const esWmsLayer = layers.find((i: { getClassName: () => string }) => 
      i.getClassName() === LAYER_NAMES.ES_WMS_LAYER
    );
    if (esWmsLayer) {
      MapInstance.value.removeLayer(esWmsLayer);
    }

  if (MapInstance.value.getOverlays().getArray().length > 0) {
    MapInstance.value.getOverlays().clear();
  }

   if (cardStore?.clearDrawTool) {
    cardStore.clearDrawTool();
  }
};

const openSettingModal = () => {
  modalStore.setModalType(MODAL_SETTING);
};

const openBigPanel = () => {
  panelStore.setBigPanelType(PANEL_MAP_TYPE.VECTOR_LAYER);
};
</script>
<template>
  <ul class="Clear_clear__Zy0p7">
    <li @click="openBigPanel">
      <el-tooltip
        class="box-item"
        effect="dark"
        content="地图操作"
        placement="left"
        :offset="20"
      >
        <span role="img" class="anticon">
          <svg
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
            class=""
          >
            <use xlink:href="#icon-operate"></use>
          </svg>
        </span>
      </el-tooltip>
    </li>
    <li @click="openSettingModal">
      <el-tooltip
        class="box-item"
        effect="dark"
        content="设置"
        placement="left"
        :offset="20"
      >
        <span role="img" class="anticon">
          <svg
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
            class=""
          >
            <use xlink:href="#icon-set-up"></use>
          </svg>
        </span>
      </el-tooltip>
    </li>
    <li @click="handleClear">
      <el-tooltip
        class="box-item"
        effect="dark"
        content="清除"
        placement="left"
        :offset="20"
      >
        <span role="img" class="anticon">
          <svg
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
            class=""
          >
            <use xlink:href="#icon-delete"></use>
          </svg>
        </span>
      </el-tooltip>
    </li>
  </ul>
</template>
<style scoped>
ul {
  background-color: var(--primary-color);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  box-shadow: 0 0 4px 2px rgba(0, 0, 0, 0.2);
  position: absolute;
  right: 10px;
  top: 590px;
  z-index: 5;
}

li {
  font-size: 22px;
  height: 32px;
  transition: background-color 0.3s;
  width: 32px;
  align-items: center;
  display: flex;
  justify-content: center;
  cursor: pointer;
}

li svg {
  fill: var(--primary-svg-color);
}

li:hover {
  background-color: var(--primary-svg-hover-color);
}

ul > li:not(:last-child) {
  border-bottom: 1px solid var(--primary-li-bottom-color);
}

html[data-theme="NIGHT"] {
  ul {
    background: var(--primary-color);
    border-color: var(--widget-border);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }
  li svg {
    fill: var(--primary-svg-color);
  }
  li:hover {
    background-color: var(--hover-bg);
  }
  ul > li:not(:last-child) {
    border-bottom-color: var(--primary-li-bottom-color);
  }
}
</style>
