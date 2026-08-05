/*
 * @Author: huanghuanrong
 * @Date: 2026-04-16 14:00:56
 * @LastEditTime: 2026-05-22 09:57:48
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\src\composables\useResponsive.ts
 */
import { ref, onMounted, onUnmounted, computed } from "vue";

export type DeviceType = "mobile" | "tablet" | "desktop";

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

export function useResponsive() {
  const windowWidth = ref(typeof window !== "undefined" ? window.innerWidth : 0);

  const handleResize = () => {
    windowWidth.value = window.innerWidth;
  };

  onMounted(() => {
    window.addEventListener("resize", handleResize);
    handleResize();
  });

  onUnmounted(() => {
    window.removeEventListener("resize", handleResize);
  });

  const isMobile = computed(() => windowWidth.value < MOBILE_BREAKPOINT);
  const isTablet = computed(
    () => windowWidth.value >= MOBILE_BREAKPOINT && windowWidth.value < TABLET_BREAKPOINT
  );
  const isDesktop = computed(() => windowWidth.value >= TABLET_BREAKPOINT);

  const deviceType = computed<DeviceType>(() => {
    if (isMobile.value) return "mobile";
    if (isTablet.value) return "tablet";
    return "desktop";
  });

  const breakpoint = computed(() => {
    if (isMobile.value) return "sm";
    if (isTablet.value) return "md";
    return "lg";
  });

  return {
    windowWidth,
    isMobile,
    isTablet,
    isDesktop,
    deviceType,
    breakpoint,
    MOBILE_BREAKPOINT,
    TABLET_BREAKPOINT,
  };
}

export function useTouch() {
  const isTouchDevice = ref(false);

  onMounted(() => {
    isTouchDevice.value =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
  });

  return {
    isTouchDevice,
  };
}
