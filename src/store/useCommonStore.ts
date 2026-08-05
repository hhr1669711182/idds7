import { defineStore } from "pinia";
import { THEME_COLOR } from "../const";

export const useCommonStore = defineStore("commonStore", {
  state: () => {
    return {
      themeColor: THEME_COLOR.DAY,
    };
  },
  actions: {
    setThemeColor(color: string) {
      this.themeColor = color;
      return { color };
    },
  },
});
