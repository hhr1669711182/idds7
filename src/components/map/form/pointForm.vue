<script setup lang="ts">
import { reactive } from "vue";
import { storeToRefs } from "pinia";
import { Style, Icon } from "ol/style";
import { useCardStore } from "../../../store/index.ts";
import { getSVGForSrcById } from "../../../util/index";
import { POINT_IMG_OPTIONS } from "../../../const/const.form.ts";
import { StyleLike } from "ol/style/Style";

const cardstore = useCardStore();
const { getItem: getMarkerData } = cardstore;
const { showUuid } = storeToRefs(cardstore);

const DEFAULT_SYMBOL_ID = "icon-symbol-one";

const form = reactive({
  uuid: showUuid.value,
  color: "red",
  size: 25,
  symbolId: DEFAULT_SYMBOL_ID,
  showName: true,
  name: "point",
});

const changeColor = (color: string) => {
  form.color = color;

  const overlayTip = document.querySelector(`#overlay_${form.uuid}`);
  if (overlayTip) {
    overlayTip.style.borderColor = color;
  }
  changeMarkerIcon({ color });
};

const changeSize = (size: number) => {
  let { marker: targetMarker, overlay: targetOverlay } = getMarkerData();
  let rate = size / 25;
  if (targetMarker) {
    var markerStyle: StyleLike | undefined = targetMarker.getStyle();
    var img = markerStyle?.getImage();
    img.setScale(rate);
    targetMarker.setStyle(markerStyle);
  }

  if (targetOverlay) {
    targetOverlay.setOffset([15 * rate, -30 * rate]);
  }
};

const changeMarkerIcon = ({
  symbolId,
  color,
}: {
  symbolId?: string;
  color?: string;
}) => {
  symbolId = symbolId || form.symbolId;
  color = color || form.color;
  let { marker: targetMarker } = getMarkerData();
  if (targetMarker) {
    const originStyle: StyleLike | undefined = targetMarker.getStyle();
    var markerStyle = new Style({
      image: new Icon({
        anchor: [0.5, 1],
        src: getSVGForSrcById({ symbolId, color }),
        scale: originStyle?.getImage().getScale(),
      }),
    });
    targetMarker.setStyle(markerStyle);
  }
};

const handleClickDefault = () => {
  const symbolId = DEFAULT_SYMBOL_ID;
  form.symbolId = DEFAULT_SYMBOL_ID;
  changeMarkerIcon({ symbolId });
};

const changeShowName = (visible: boolean) => {
  let { overlay: targetOverlay } = getMarkerData();
  if (targetOverlay) {
    const ele = targetOverlay.getElement();
    if (ele) {
      ele.style.display = visible ? "block" : "none";
    }
  }
};

const handleClickImgOptions = ({
  className: symbolId,
}: {
  className: string;
}) => {
  form.symbolId = symbolId;
  changeMarkerIcon({ symbolId });
};
</script>

<template>
  <el-form
    :model="form"
    label-width="auto"
    style="max-width: 600px"
    :class="'card_' + form.uuid"
  >
    <el-form-item label="符号集合:">
      <div class="icon_container">
        <span
          @click="handleClickDefault"
          id="defaultIcon"
          :class="{ active: form.symbolId == DEFAULT_SYMBOL_ID }"
        >
          <svg
            width="26px"
            height="26px"
            fill="red"
            aria-hidden="true"
            focusable="false"
            class=""
          >
            <use xlink:href="#icon-symbol-one"></use>
          </svg>
          <span>默认</span>
        </span>
        <span
          v-for="{ className, label, position } in POINT_IMG_OPTIONS"
          :class="{ active: form.symbolId == className }"
          @click="() => handleClickImgOptions({ className })"
        >
          <i
            :class="className"
            :style="{
              backgroundPositionX: position[0] + 'px',
              backgroundPositionY: position[1] + 'px',
            }"
          ></i>
          <span>{{ label }}</span>
        </span>
      </div>
    </el-form-item>
    <el-form-item label="符号颜色:">
      <el-color-picker
        v-model="form.color"
        @change="changeColor"
        @active-change="changeColor"
        show-alpha
      />
    </el-form-item>
    <el-form-item label="符号大小:">
      <el-input-number
        v-model="form.size"
        :step="1"
        :precision="0"
        :max="50"
        :min="16"
        @change="changeSize"
      />
    </el-form-item>
    <el-form-item label="显示名称:">
      <el-switch v-model="form.showName" @change="changeShowName" />
    </el-form-item>
  </el-form>
</template>

<style scoped>
.icon_container {
  border: 1px solid #d9d9d9;
  flex-wrap: wrap;
  justify-content: flex-start;
  padding: 6px 6px 6px 10px;
  width: 240px;
  align-items: center;
  display: flex;
}

.icon_container > span {
  cursor: pointer;
  flex-direction: column;
  height: 70px;
  transition: all 0.3s;
  width: 44px;
  align-items: center;
  display: flex;
  justify-content: center;
}

.icon_container > span:hover {
  color: #149bf0;
}

.icon_container > span.active {
  color: #149bf0;
}

.icon_container i {
  background: url(../../../assets/marker.png) no-repeat;
  display: inline-block;
  height: 26px;
  width: 26px;
}

.icon_container span span {
  font-size: 12px;
  margin-top: 5px;
}
</style>
