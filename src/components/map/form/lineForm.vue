<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { Style, Stroke } from "ol/style";
import { useCardStore } from "../../../store/index.ts";
import rightImg from "../../../assets/right.png";
import { getSVGForSrcById, getStyleFunction } from "../../../util/index.ts";
import { LINE_FORM_LINE_STYLES } from "../../../const/const.map.ts";
import Slider from "../../../baseComponent/Slider.vue";
import { Feature } from "ol";
import { StyleLike } from "ol/style/Style";

const cardstore = useCardStore();
const { showUuid } = storeToRefs(cardstore);

const props = defineProps<{
  formData: {
    feature: Feature;
    lineStyle: string;
  };
}>();

const form = ref({
  uuid: showUuid.value,
  width: 2,
  color: "",
  ...props.formData,
});

const resetFrom = (p: {
  feature?: Feature;
  lineStyle?: string;
  uuid?: string;
  width?: number;
  color?: string;
}) => {
  form.value = { ...form.value, ...p };
};

const changLineStyle = ({
  lineStyle,
  color,
  width,
}: {
  lineStyle: string;
  color?: string;
  width?: number;
}) => {
  let newStyle: StyleLike | undefined;

  const StyleIndex = LINE_FORM_LINE_STYLES.filter(
    ({ value }) => value == lineStyle
  )[0];

  const styleColor = color || StyleIndex.color;
  const styleWidth = width || StyleIndex.width;

  switch (lineStyle) {
    case LINE_FORM_LINE_STYLES[0].value:
      newStyle = new Style({
        stroke: new Stroke({
          color: styleColor,
          width: styleWidth,
        }),
      });

      break;
    case LINE_FORM_LINE_STYLES[1].value:
      newStyle = new Style({
        stroke: new Stroke({
          color: styleColor,
          width: styleWidth,
          lineDash: [6, 4],
        }),
      });

      break;
    case LINE_FORM_LINE_STYLES[3].value:
      newStyle = [
        new Style({
          stroke: new Stroke({
            color: styleColor,
            width: styleWidth,
          }),
        }),
        new Style({
          stroke: new Stroke({
            color: "#fff",
            width: styleWidth,
            lineDash: [10, 50],
            lineCap: "square",
            lineDashOffset: 8,
          }),
        }),
      ];
      break;
    case LINE_FORM_LINE_STYLES[4].value:
      newStyle = [
        new Style({
          stroke: new Stroke({
            color: "#fff",
            width: styleWidth,
          }),
        }),
        new Style({
          stroke: new Stroke({
            color: styleColor,
            width: styleWidth,
            lineDash: [50, 15],
            lineCap: "square",
          }),
        }),
      ];
      break;
    case LINE_FORM_LINE_STYLES[2].value:
      newStyle = getStyleFunction({
        color: styleColor,
        width: styleWidth,
        imgsrc: rightImg,
        wrapperRotation: (r: number) => -r,
      });
      break;
    case LINE_FORM_LINE_STYLES[5].value:
      let img = getSVGForSrcById({
        symbolId: "icon-right-direction",
        color: "#000",
      });
      newStyle = getStyleFunction({
        color: styleColor,
        width: styleWidth,
        imgsrc: img,
        scale: 0.25,
        wrapperRotation: (r: number) => -r,
      });
      break;
    case LINE_FORM_LINE_STYLES[6].value:
      newStyle = getStyleFunction({
        color: styleColor,
        width: styleWidth,
        imgsrc: rightImg,
        scale: 0.25,
        wrapperRotation: (r: number) => -r - Math.PI / 2,
      });
      break;
    case LINE_FORM_LINE_STYLES[7].value:
      {
        let img = getSVGForSrcById({
          symbolId: "icon-right-direction",
          color: "#000",
        });
        newStyle = getStyleFunction({
          color: styleColor,
          width: styleWidth,
          imgsrc: img,
          scale: 0.25,
          wrapperRotation: (r) => -r,
        });
      }
      break;
  }

  resetFrom({ lineStyle, color: styleColor, width: styleWidth });
  form.value.feature.setStyle(newStyle);
};

const changeColor = (color: string) => {
  const { lineStyle, width } = form.value;
  changLineStyle({ lineStyle, color, width });
};

const changeWidth = (width: number) => {
  const { lineStyle, color } = form.value;
  changLineStyle({ lineStyle, color, width });
};

const currentLine = computed(() => {
  return LINE_FORM_LINE_STYLES.filter((item) => {
    return item.value == form.value.lineStyle;
  })[0];
});
</script>

<template>
  <el-form
    :model="form"
    label-width="auto"
    style="max-width: 600px"
    :class="'card_' + form.uuid"
  >
    <el-form-item label="线条:">
      <el-select
        v-model="form.lineStyle"
        placeholder="请选择线条样式"
        style="width: 100%"
        @change="(val: string) => changLineStyle({ lineStyle: val })"
      >
        <template #label>
          <span class="custom-label">
            <i
              class="i_option"
              :style="{
                backgroundPositionX: currentLine.position[0] + 'px',
                backgroundPositionY: currentLine.position[1] + 'px',
                height: currentLine.height + 'px',
              }"
            ></i>
          </span>
        </template>
        <el-option
          v-for="item in LINE_FORM_LINE_STYLES"
          :key="item.value"
          :label="item.value"
          :value="item.value"
        >
          <i
            class="i_option"
            :style="{
              backgroundPositionX: item.position[0] + 'px',
              backgroundPositionY: item.position[1] + 'px',
              height: item.height + 'px',
            }"
          ></i>
        </el-option>
      </el-select>
    </el-form-item>
    <el-form-item label="颜色:">
      <el-color-picker
        v-model="form.color"
        @change="changeColor"
        @active-change="changeColor"
        show-alpha
      />
    </el-form-item>
    <el-form-item label="线宽:">
      <slider :value="form.width" :min="1" :max="12" @change="changeWidth" />
    </el-form-item>
  </el-form>
</template>

<style scoped>
.custom-label {
  display: flex;
  align-items: center;
  justify-content: center;
}

.i_option {
  display: inline-block;
  background: url(../../../assets/lineOption.png) no-repeat;
  height: 8px;
  width: 180px;
}
</style>
