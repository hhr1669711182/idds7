<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { MODAL_SETTING } from "../../const/const.modals.ts";
const setting = defineAsyncComponent(() => import("./setting.vue"));
import { useModalStore } from "../../store/index.ts";

const store = useModalStore();

const { type } = storeToRefs(store);

const currentComponent = computed(() => {
  switch (type.value) {
    //设置
    case MODAL_SETTING:
      return setting;
    default:
      return null;
  }
});
</script>

<template>
  <component :is="currentComponent" />
</template>
