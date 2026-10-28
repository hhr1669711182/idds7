<script setup lang="ts">
import { reactive } from "vue";
import { storeToRefs } from "pinia";
import { Icon } from "ol/style";
import Style from "ol/style/Style";
import { useCardStore } from "../../../store/useCardStore";
import { getSVGForSrcById } from "@/utils/index.ts";
import { POINT_IMG_OPTIONS } from "../../../const/const.form.ts";

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

// el-color-picker 的 change / active-change 回调参数都可能为 null
const changeColor = (color: string | null) => {
  const nextColor = color ?? "";
  form.color = nextColor;

  const overlayTip = document.querySelector<HTMLElement>(`#overlay_${form.uuid}`);
  if (overlayTip) {
    overlayTip.style.borderColor = nextColor;
  }
  changeMarkerIcon({ color: nextColor });
};

// el-input-number 的 change 回调会带上旧值，且新值可能为 undefined
const changeSize = (size: number | undefined) => {
  if (size === undefined) return;
  let { marker: targetMarker, overlay: targetOverlay } = getMarkerData();
  let rate = size / 25;
  if (targetMarker) {
    const markerStyle = targetMarker.getStyle();
    // getStyle() 返回的是 StyleLike 联合类型，只有 Style 实例才有 getImage()
    const img = markerStyle instanceof Style ? markerStyle.getImage() : null;
    img?.setScale(rate);
    if (markerStyle) targetMarker.setStyle(markerStyle);
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
    const originStyle = targetMarker.getStyle();
    const originScale = originStyle instanceof Style ? originStyle.getImage()?.getScale() : undefined;
    var markerStyle = new Style({
      image: new Icon({
        anchor: [0.5, 1],
        src: getSVGForSrcById({ symbolId, color }),
        scale: originScale,
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

// el-switch 的 change 回调参数类型为 string | number | boolean
const changeShowName = (visible: string | number | boolean) => {
  const showName = Boolean(visible);
  let { overlay: targetOverlay } = getMarkerData();
  if (targetOverlay) {
    const ele = targetOverlay.getElement();
    if (ele) {
      ele.style.display = showName ? "block" : "none";
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
  <el-form :model="form" label-width="auto" style="max-width: 600px" :class="'card_' + form.uuid">
    <el-form-item label="符号集合:">
      <div class="icon_container">
        <span @click="handleClickDefault" id="defaultIcon" :class="{ active: form.symbolId == DEFAULT_SYMBOL_ID }">
          <svg width="26px" height="26px" fill="red" aria-hidden="true" focusable="false" class="">
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
      <el-color-picker v-model="form.color" @change="changeColor" @active-change="changeColor" show-alpha />
    </el-form-item>
    <el-form-item label="符号大小:">
      <el-input-number v-model="form.size" :step="1" :precision="0" :max="50" :min="16" @change="changeSize" />
    </el-form-item>
    <el-form-item label="显示名称:">
      <el-switch v-model="form.showName" @change="changeShowName" />
    </el-form-item>
  </el-form>
</template>

<style scoped>
.icon_container {
  border: 1px solid var(--card-border);
  flex-wrap: wrap;
  justify-content: flex-start;
  padding: 6px 6px 6px 10px;
  width: 240px;
  align-items: center;
  display: flex;
  background: var(--card-bg);
  border-radius: 6px;
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
  color: var(--text-secondary);
}

.icon_container > span:hover {
  color: var(--accent-cyan);
}

.icon_container > span.active {
  color: var(--accent-gold);
}

.icon_container i {
  background: url(@/assets/ui/buttons/marker.png) no-repeat;
  display: inline-block;
  height: 26px;
  width: 26px;
}

.icon_container span span {
  font-size: 12px;
  margin-top: 5px;
}

html[data-theme="NIGHT"] {
  :deep(.el-form-item__label) {
    color: var(--text-secondary);
  }
}
</style>
