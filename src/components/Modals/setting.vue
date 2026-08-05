<!--
 * @Author: huanghuanrong
 * @Date: 2026-03-31 15:30:08
 * @LastEditTime: 2026-04-10 17:53:36
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \OpenlayersMap\src\components\Modals\setting.vue
-->
<script setup lang="ts">
import { ref, toRaw } from "vue";
import { storeToRefs } from "pinia";
import { SCALEPLATE_LIST } from "../../const/const.map.ts";
import { MODAL_NULL } from "../../const/const.modals";
import { ScaleLine } from "ol/control";
import { useModalStore, useMapStore } from "../../store/index.ts";
import { Map } from "ol";

const mapStore = useMapStore();

const { map } = storeToRefs(mapStore);
const modalStore = useModalStore();

const scaleValue = ref(SCALEPLATE_LIST[0].t);

const selectScaleUnit = (unit: string) => {
  const v: any = SCALEPLATE_LIST.filter(({ t }) => unit == t)[0].v;
  const mapInstance = toRaw(map.value) as Map;

  const scaleControl: ScaleLine | undefined = mapInstance
    .getControls()
    .getArray()
    .find((control: any) => control instanceof ScaleLine);

  if (scaleControl && scaleControl.getUnits() != v) {
    scaleControl.setUnits(v);
  }
};
const hideModal = () => {
  modalStore.setModalType(MODAL_NULL);
};

const loading = ref(false);
</script>
<template>
  <el-dialog
    :model-value="true"
    title="设置"
    width="30%"
    :close-on-press-escape="false"
    @close="hideModal()"
  >
    <div v-loading="loading">
      <div class="content">
        <div class="item">
          <span>比例尺</span>
          <el-select
            v-model="scaleValue"
            placeholder="请选择比例尺单位"
            style="width: 80%"
            @change="selectScaleUnit"
          >
            <template v-for="item in SCALEPLATE_LIST">
              <el-option :label="item.t" :value="item.t">
                <span style="float: left">{{ item.t }}</span>
                <span style="float: right; color: #aaa">{{ item.v }}</span>
              </el-option>
            </template>
          </el-select>
        </div>
      </div>
    </div>
  </el-dialog>
</template>
<style scoped>
.item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
}
.item span {
  margin-right: 10px;
}
</style>
