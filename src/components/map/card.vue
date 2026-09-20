<script setup lang="ts">
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useCardStore, useMapStore } from "../../store";
import { CARD_TITLE } from "../../const/const.map";
import pointForm from "./form/pointForm.vue";
import lineForm from "./form/lineForm.vue";
import polygonForm from "./form/polygonForm.vue";
import circleForm from "./form/circleForm.vue";
import { TYPES } from "../../const/const.map";

const cardstore = useCardStore();

const { setShowUuid, getItem, removeItem, setItem } = cardstore;

const { showUuid } = storeToRefs(cardstore);

const MapStore = useMapStore();

let form = ref({ name: "", type: "", mark: "" });

cardstore.$onAction(({ name, after }) => {
  if (name == "addData") {
    after((p) => {
      form.value = { ...form.value, ...p, ...p.formData };
    });
  }
});
const handleClose = () => {
  setShowUuid("");
};

const handleSave = () => {
  changeName(form.value.name);
  
  handleClose()
};

const handleDelete = () => {
  let { marker: targetMarker, overlay: targetOverlay, feature } = getItem();
  if (targetOverlay) {
    MapStore.map?.removeOverlay(targetOverlay);
  }
  const vectorLayer = (cardstore.drawTool as any)?.vectorLayer;
  if (vectorLayer) {
    if (targetMarker) {
      vectorLayer.getSource().removeFeature(targetMarker);
    }
    if (feature) {
      vectorLayer.getSource().removeFeature(feature);
    }
  }
  removeItem({ uuid: showUuid.value });
  setShowUuid("");
};

const changeName = (name: string) => {
  let cardName = !name ? "未命名" : name;
  setItem({ name: cardName, uuid: showUuid.value });
  form.value.name = cardName;

  const { overlay } = getItem();
  if (overlay && overlay.getElement()) {
    overlay.getElement().innerText = cardName;
  }
};

const formComponent = computed(() => {
  const { type } = form.value;
  switch (type) {
    case TYPES.POINT:
      return pointForm;
    case TYPES.LINESTRING:
      return lineForm;
    case TYPES.POLYGON:
    case TYPES.RECT:
      return polygonForm;
    case TYPES.CIRCLE:
      return circleForm;
    default:
      return null;
  }
});
</script>

<template>
  <div class="card_panel" v-if="!!showUuid" :key="showUuid">
    <div class="card_header">
      <span>{{ CARD_TITLE[form.type as keyof typeof CARD_TITLE] }}</span>
      <span
        role="img"
        tabindex="-1"
        class="anticon Head_close__0vFMi"
        @click="handleClose"
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
        <div class="editPanel">
          <el-form :model="form" label-width="auto" style="max-width: 600px">
            <el-form-item label="名称:">
              <el-input
                v-model="form.name"
                maxlength="10"
                @change="changeName"
              />
            </el-form-item>
            <el-form-item label="备注:">
              <el-input v-model="form.mark" :rows="2" type="textarea" />
            </el-form-item>
          </el-form>
          <div class="styleSet">
            <div class="styleSetTitle">样式设置</div>
            <component :is="formComponent" :formData="form" />
          </div>
          <div class="card_body_footer" style="display: none;">
            <el-button type="primary" @click="handleSave">保存</el-button>
            <el-button @click="handleDelete">删除</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div id="helpTxt"></div>
</template>

<style scoped lang="less">
#helpTxt {
  position: relative;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  color: white;
  padding: 4px 8px;
  opacity: 0.7;
  white-space: nowrap;
  font-size: 12px;
  cursor: default;
  user-select: none;
  display: none;
}
.card_panel {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: var(--panel-shadow);
  min-height: 200px;
  position: absolute;
  right: 70px;
  top: 100px;
  width: 350px;
  z-index: 5;
}

.card_header {
  background-color: var(--header-bg);
  background: var(--header-bg);
  color: var(--header-text);
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

.editPanel {
  padding: 10px;
  color: var(--text-primary);
}

.styleSet {
  padding: 0 0 20px;
}

.styleSetTitle {
  background-color: var(--card-bg);
  border-left: 4px solid var(--accent-cyan);
  color: var(--text-secondary);
  margin-bottom: 24px;
  padding: 6px 10px;
}

.Head_close__0vFMi {
  cursor: pointer;
  color: var(--header-text);
}

html[data-theme="NIGHT"] {
  .card_panel {
    color: var(--text-primary);
  }
  /* :global 穿透 scoped hash，:global 内部选择器能直接匹配 EP 渲染出来的 DOM */
  :global(.editPanel .el-form-item__label) {
    color: var(--text-secondary);
  }
  :deep(.el-input__wrapper),
  :deep(.el-textarea__inner) {
    background: var(--card-bg);
    box-shadow: 0 0 0 1px var(--card-border) inset;
  }
  :deep(.el-input__inner),
  :deep(.el-textarea__inner) {
    color: var(--text-primary);
  }
  :deep(.el-button--primary) {
    --el-button-bg-color: var(--active-border);
    --el-button-border-color: var(--active-border);
    --el-button-hover-bg-color: #5a88c4;
    --el-button-hover-border-color: #5a88c4;
  }
}
</style>
