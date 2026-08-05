<script setup lang="ts">
import { onMounted, ref, shallowRef } from "vue";
// import { storeToRefs } from "pinia";

import tlp from "../map/compass.vue";
// import trp from "../map/trp.vue";
// import clear from "../map/clear.vue";
import brp from "../map/brp.vue";
// import baseSource from "../map/component/baseSource.vue";
import OpenlayersMap from "../../baseComponent/OpenlayersMap/dispatchMap.vue";
import {
  useMapConfigStore,
  useDispatchMapStore,
} from "@/store/index.ts";
import { Icon } from "@iconify/vue";
import { watch } from "vue";

type OpenlayersMapExpose = {
  addLayer: (id: string) => boolean;
  removeLayer: (id: string) => boolean;
  syncLayers: (ids: string[]) => void;
};

const dispatchMapStore = useDispatchMapStore();
const mapConfigStore = useMapConfigStore();

const dispatchMapRef = shallowRef<OpenlayersMapExpose | null>(null);

// 提取数据配置模板
const filterData = ref<Record<string, any>>({
  timeRangeMin: 1,
  timeRangeMax: 30,
  carType: "all",
  showResourceCircle: false,
});

const filterConfig = ref<any>([
  {
    type: "timeRange",
    label: "预计时间 (min):",
    modelMin: "timeRangeMin",
    modelMax: "timeRangeMax",
    minProps: { min: 1, max: 60, placeholder: "1" },
    maxProps: { min: 1, max: 120, placeholder: "30" },
  },
  // {
  //   type: "select",
  //   label: "车辆类型:",
  //   model: "carType",
  //   options: [
  //     { label: "全部", value: "all" },
  //     { label: "水罐车", value: "water" },
  //     { label: "泡沫车", value: "foam" },
  //   ],
  // },
  {
    type: "checkbox",
    label: "资源圈",
    model: "showResourceCircle",
  },
]);

const layerCheckboxes = [
  { id: "gis:view_res_org_dept", label: "消防站", icon: "mdi:home-variant" },
  { id: "gis:view_juris_zone", label: "队站辖区", icon: "mdi:map-check-outline" },
  // { id: "standby_car", label: "待命车辆", checked: true, icon: "mdi:car-emergency" },
  // { id: "duty_point", label: "执勤点", checked: true, icon: "mdi:map-marker-radius" },
  // { id: "full_time_team", label: "专职队", checked: false, icon: "mdi:account-group" },
  // { id: "micro_station", label: "微站", checked: false, icon: "mdi:home-city" },
  // { id: "linked_unit", label: "联动单位", checked: true, icon: "mdi:domain" },
];

watch(() => dispatchMapStore.checkedIds, (newIds) => {
  dispatchMapRef.value?.syncLayers(newIds);
}, { deep: true });

const getMap = (map: any) => {
  dispatchMapStore.setMap(map);
  dispatchMapRef.value?.syncLayers(dispatchMapStore.checkedIds);
};

onMounted(async () => {
  await mapConfigStore.loadConfig();
  dispatchMapRef.value?.syncLayers(dispatchMapStore.checkedIds);
});
</script>

<template>
  <OpenlayersMap ref="dispatchMapRef" mapId="dispatch-map" @setMap="getMap" />
  <div class="dispatch-top-bar">
    <!-- <el-button type="primary" color="#1c2438" class="menu-btn">
      <Icon icon="mdi:format-list-bulleted" class="mr-2" />
      待命列表
    </el-button> -->
    
    <div class="filter-group">
      <div 
        v-for="(item, index) in filterConfig" 
        :key="index" 
        :class="['filter-item', { 'ml-6': Number(index) > 0 }]"
      >
        <template v-if="item.type === 'timeRange'">
          <span class="label">{{ item.label }}</span>
          <el-input-number size="small" class="w-32" v-model="filterData[item.modelMin]" v-bind="item.minProps" controls-position="right" />
          <span class="mx-2">-</span>
          <el-input-number size="small" class="w-32" v-model="filterData[item.modelMax]" v-bind="item.maxProps" controls-position="right" />
        </template>
        
        <template v-else-if="item.type === 'select'">
          <span class="label">{{ item.label }}</span>
          <el-select size="small" class="!w-32" v-model="filterData[item.model]" placeholder="全部">
            <el-option 
              v-for="opt in item.options" 
              :key="opt.value" 
              :label="opt.label" 
              :value="opt.value" 
            />
          </el-select>
        </template>

        <template v-else-if="item.type === 'checkbox'">
          <el-checkbox v-model="filterData[item.model]">{{ item.label }}</el-checkbox>
        </template>
      </div>
    </div>
  </div>

  <!-- Bottom Bar (Dispatch specific) -->
  <div class="dispatch-bottom-bar">
    <!-- <div class="settings-btn">
      <Icon icon="streamline-plump-color:map-fold" :size="20" class="mr-2" />
      <span>地图图层显示:</span>
    </div> -->
    <div class="layer-checkboxes">
      <el-checkbox-group v-model="dispatchMapStore.checkedIds" class="flex gap-3">
        <el-checkbox 
          v-for="item in layerCheckboxes" 
          :key="item.id" 
          :label="item.label"
          :value="item.id"
        >
          <div :class="['flex items-center transition-colors', dispatchMapStore.checkedIds.includes(item.id) ? 'text-blue-500' : 'text-gray-400']">
            <Icon :icon="item.icon" class="mr-1" /> 
            {{ item.label }}
          </div>
        </el-checkbox>
      </el-checkbox-group>
    </div>
  </div>

  <tlp />
  <brp />
  <!-- <trp /> -->

  <!-- <baseSource /> -->
  <!-- <clear /> -->
  <!-- <config @save="handleConfigSave" /> -->
  <!-- <layers :onLayerChange="handleLayerChange" /> -->
</template>

<style scoped>

.dispatch-top-bar {
  position: absolute;
  top: 10px;
  left: 20px;
  display: flex;
  align-items: center;
  z-index: 100;
  gap: 16px;
}

.menu-btn {
  font-size: 16px;
  padding: 10px 20px;
  border-radius: 6px;
}

.filter-group {
  display: flex;
  align-items: center;
  background-color: #1c2438;
  padding: 4px 8px;
  border-radius: 6px;
  color: white;
}

.filter-item {
  display: flex;
  align-items: center;
  color: #ccc;
}

.filter-item .label {
  margin-right: 8px;
  color: #8c9bb3;
}

:deep(.el-input-number__decrease), :deep(.el-input-number__increase) {
  background-color: #2b3548;
  border-color: #3b4558;
  color: white;
}

:deep(.el-input__wrapper),
:deep(.el-select__wrapper) {
  background-color: #1c2438;
  box-shadow: 0 0 0 1px #3b4558 inset;
}

:deep(.el-input__inner),
:deep(.el-select__placeholder) {
  color: white;
}

:deep(.el-checkbox__label) {
  color: white;
}

.dispatch-bottom-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  /* background-color: #1c2438; */
  display: flex;
  align-items: center;
  justify-content: center;
  /* padding: 10px 20px; */
  z-index: 100;
}

.settings-btn {
  display: flex;
  align-items: center;
  color: #8c9bb3;
  margin-right: 24px;
  font-size: 14px;
}

.layer-checkboxes {
  display: flex;
  gap: 12px;
  background-color: #1c2438;
  padding: 2px 12px;
  border-radius: 6px 6px 0 0;
}

:deep(.layer-checkboxes .el-checkbox__label) {
  display: flex;
  align-items: center;
}
</style>
