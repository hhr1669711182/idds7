import { defineStore } from "pinia";
import { THEME_COLOR } from "../const";

export const useCommonStore = defineStore("commonStore", {
  state: () => {
    return {
      // 与 index.html 的 data-theme="NIGHT" 保持一致：系统默认夜间模式
      themeColor: THEME_COLOR.NIGHT,
    };
  },
  actions: {
    setThemeColor(color: string) {
      this.themeColor = color;
      // 库模式下宿主页面未必带 data-theme，这里统一兜底同步，避免 store 与 DOM 脱节
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", color);
      }
      return { color };
    },
  },
});