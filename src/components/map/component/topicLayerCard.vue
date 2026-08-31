<script setup lang="ts">
import { ref, toRaw, markRaw } from "vue";
import { storeToRefs } from "pinia";
import { PANEL_MAP_TYPE, THEMATIC_MAP_TYPES } from "../../../const/index";
import { useTopicLayerStore, useMapStore, usePanelStore } from "../../../store";
import {
  HeatMapTools,
  ClusterTools,
  MaskTools,
  TimeTools,
  WeatherTools,
} from "../MapTools/ThemeTools/index";
import clusterImage from "../assets/cluster.png";
import heatMapImage from "../assets/heatMap.jpg";
import maskImage from "../assets/mask.jpg";
import weatherImage from "../assets/weather.jpg";
import vectorImage from "../assets/vector.png";
import timeImage from "../assets/time.jpg";

const mapStore = useMapStore();
const topicStore = useTopicLayerStore();

const panelStore = usePanelStore();

const { visible } = storeToRefs(topicStore);

let toolMap:
  | ClusterTools
  | HeatMapTools
  | MaskTools
  | WeatherTools
  | TimeTools
  | null = null;

const hideCard = () => {
  resetMap();
  topicStore.setVisible(false);
};

const handleTools = (type: string) => {
  resetMap();
  const p = { map: markRaw(toRaw(mapStore.map)) };
  switch (type) {
    case THEMATIC_MAP_TYPES.CLUSTERL:
      toolMap = new ClusterTools({ map: p.map, markersLimitNum: 50 });
      break;
    case THEMATIC_MAP_TYPES.HEATMAP:
      toolMap = new HeatMapTools({ map: p.map, markersLimitNum: 1000 });
      break;
    case THEMATIC_MAP_TYPES.MASK_MAP:
      toolMap = new MaskTools(p);
      break;
    case THEMATIC_MAP_TYPES.WEATHER_MAP:
      toolMap = new WeatherTools(p);
      break;
    case THEMATIC_MAP_TYPES.TIME_MAP:
      toolMap = new TimeTools(p);
      break;
  }

  toolMap?.create();
};

const MAP_THEMES = [
  {
    name: "聚合图层",
    type: THEMATIC_MAP_TYPES.CLUSTERL,
    callback: () => handleTools(THEMATIC_MAP_TYPES.CLUSTERL),
    src: clusterImage,
  },
  {
    name: "热力图",
    type: THEMATIC_MAP_TYPES.HEATMAP,
    callback: () => handleTools(THEMATIC_MAP_TYPES.HEATMAP),
    src: heatMapImage,
  },
  {
    name: "蒙版图层",
    type: THEMATIC_MAP_TYPES.MASK_MAP,
    callback: () => handleTools(THEMATIC_MAP_TYPES.MASK_MAP),
    src: maskImage,
  },
  {
    name: "气象专题",
    type: THEMATIC_MAP_TYPES.WEATHER_MAP,
    callback: () => handleTools(THEMATIC_MAP_TYPES.WEATHER_MAP),
    src: weatherImage,
  },
  {
    name: "时间专题",
    type: THEMATIC_MAP_TYPES.TIME_MAP,
    callback: () => handleTools(THEMATIC_MAP_TYPES.TIME_MAP),
    src: timeImage,
  },
  {
    name: "矢量图高亮",
    type: THEMATIC_MAP_TYPES.HIGHLIGHT_VECTOR_MAP,
    callback: () => {
      panelStore.setBigPanelType(PANEL_MAP_TYPE.VECTOR_LAYER);
    },
    src: vectorImage,
  },
];
const showSetting = ref(false);

const handleClickSet = () => {
  showSetting.value = !showSetting.value;
};

const activeType = ref("");

const handleClick = ({ callback, type }: any) => {
  activeType.value = type;
  if (callback) {
    callback();
  }
};

const resetMap = () => {
  if (toolMap) {
    toolMap.remove();
    toolMap = null;
  }
};
</script>

<template>
  <div class="topic_card_panel" v-if="visible">
    <div class="card_header">
      <span>专题图</span>
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
        <div class="topic_list" v-if="!showSetting">
          <el-card
            :class="
              activeType == topic.type ? 'topic_card active' : 'topic_card'
            "
            style="width: 200px; margin: 10px 14px"
            shadow="hover"
            v-for="topic in MAP_THEMES"
          >
            <template #header>
              <div class="card-topic-header">
                <span>{{ topic.name }}</span>
                <!-- <Icon icon="mdi:settings-outline" :size="18" @click="handleClickSet" /> -->
              </div>
            </template>
            <template #default>
              <div class="card-topic-body">
                <img :src="topic.src" @click="() => handleClick(topic)" />
              </div>
            </template>
          </el-card>
        </div>
        <div>
          <!-- <card-setting /> -->
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.topic_card_panel {
  background: #fff;
  border-radius: 3px;
  box-shadow: 0 2px 4px #0000004d;
  min-height: 200px;
  position: absolute;
  right: 70px;
  top: 100px;
  width: 500px;
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
  height: auto;
  min-height: 200px;
  max-height: calc(-190px + 100vh);
}

.card_body_footer {
  display: flex;
  justify-content: center;
  padding: 0 10px 20px;
}

.container {
  position: relative;
  overflow: scroll;
  margin-right: -17px;
  margin-bottom: -17px;
  min-height: 217px;
  max-height: calc(-173px + 100vh);
}

.topic_list {
  padding: 10px;
  display: flex;
  flex-wrap: wrap;
  overflow: auto;
}

.Head_close__0vFMi {
  cursor: pointer;
}
.card-topic-body {
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-topic-header {
  display: flex;
  justify-content: space-between;
  cursor: pointer;
}

:deep(.el-card__body) {
  padding: 10px;
}
:deep(.el-card__header) {
  padding: 6px;
}

.card-topic-body {
  cursor: pointer;
}
.topic_card img {
  height: 122px;
  width: 180px;
  cursor: pointer;
}
.topic_card.active img {
  cursor: not-allowed;
}
.topic_card {
  width: 200px;
  margin: 10px 14px;
}
.topic_card.active {
  color: #3385ff;
  border-color: #3385ff;
  box-shadow: 0px 0px 12px rgba(0, 0, 0, 0.12);
}
:deep(.topic_card.active .el-card__header) {
  border-color: #3385ff;
}
</style>