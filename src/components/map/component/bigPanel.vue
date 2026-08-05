<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePanelStore } from "../../../store";
import { PANEL_MAP_TYPE, PANEL_MAP_LIST } from "../../../const";
import vectorLayerHight from "./Panels/vectorLayerHight.vue";
import animationMap from "./Panels/animationMap.vue";
import analyseMap from "./Panels/analyseMap.vue";
import { computed } from "vue";

const panelStore = usePanelStore();

const { bigPanelType } = storeToRefs(panelStore);

const hideCard = () => {
  panelStore.setBigPanelType(PANEL_MAP_TYPE.NULL);
};

const handleClickType = ({ type }: { type: string }) => {
  bigPanelType.value = type;
};

const MapComp = computed(() => {
  switch (bigPanelType.value) {
    case PANEL_MAP_LIST[0].type:
      return vectorLayerHight;
    case PANEL_MAP_LIST[1].type:
      return animationMap;
    case PANEL_MAP_LIST[2].type:
      return analyseMap;
  }
});
</script>

<template>
  <div class="topic_card_panel" v-if="bigPanelType != PANEL_MAP_TYPE.NULL">
    <div class="card_header">
      <span>地图操作</span>
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
      <div class="container-left">
        <ul>
          <li
            v-for="layer in PANEL_MAP_LIST"
            :class="{ active: layer.type == bigPanelType }"
            @click="() => handleClickType(layer)"
          >
            {{ layer.txt }}
          </li>
        </ul>
      </div>
      <div class="container-right">
        <component :is="MapComp" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.topic_card_panel {
  background: #fff;
  border-radius: 3px;
  box-shadow: 0 2px 4px #0000004d;
  min-height: 600px;
  position: absolute;
  left: 70px;
  top: 100px;
  width: 1200px;
  z-index: 5;
}

.card_header {
  background-color: #3385ff;
  color: #fff;
  font-size: 16px;
  justify-content: space-between;
  line-height: 45px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  display: flex;
}

.card_body {
  position: relative;
  overflow: hidden;
  width: 100%;
  height: 545px;
  display: flex;
}

.card_body_footer {
  display: flex;
  justify-content: center;
  padding: 0 10px 20px;
}

.container-left {
  width: 220px;
  padding: 10px 6px;
}

li {
  cursor: pointer;
}
li.active {
  color: #438de8;
}
.container-right {
  position: relative;
  height: calc(100% - 20px);
  width: calc(100% - 200px);
  padding: 10px;
}
.Head_close__0vFMi {
  cursor: pointer;
}
.card-topic-header {
  display: flex;
  justify-content: space-between;
  cursor: pointer;
}
</style>
