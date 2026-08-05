<!--
 * @Author: huanghuanrong
 * @Date: 2026-04-02 18:39:34
 * @LastEditTime: 2026-04-07 18:02:21
 * @LastEditors: huanghuanrong
 * @Description: 文件描述
 * @FilePath: \OpenlayersMap\src\components\map\component\3DPanel.vue
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { EventBus } from "../../../util/mitt.ts";
import {
  NAV_FINISHED_EVENT,
  type NavFinishedPayload,
} from "../../../baseComponent/amap/useAmapTools.ts";

const IFRAME_BROADCAST_EVENT = "iframe:broadcast";

const props = defineProps<{
  name?: string;
  src?: string;
  top?: number;
  width?: number;
  height?: number;
}>();

const visible = ref(false);
const iframeRef = ref<HTMLIFrameElement | null>(null);

const toCloneable = (input: any) => {
  try {
    return structuredClone(input);
  } catch {
    const seen = new WeakSet();
    try {
      return JSON.parse(
        JSON.stringify(input, (_k, v) => {
          if (typeof v === "function") return undefined;
          if (typeof v === "bigint") return v.toString();
          if (typeof v === "symbol") return undefined;
          if (v && typeof v === "object") {
            if (seen.has(v)) return undefined;
            seen.add(v);
          }
          return v;
        }),
      );
    } catch {
      return null;
    }
  }
};

const postToIframe = (type: string, payload: any) => {
  const win = iframeRef.value?.contentWindow;
  if (!win) return;
  const safePayload = toCloneable(payload);
  win.postMessage(
    { source: "OpenlayersMap", channel: "panel", type, payload: safePayload },
    "*",
  );
};

const openWithPayload = (payload: NavFinishedPayload) => {
  visible.value = true;
  postToIframe("navFinished", payload);
};

const close = () => {
  visible.value = false;
};

const onNavFinished = (payload: any) => {
  openWithPayload(payload as NavFinishedPayload);
};

const onBroadcast = (evt: any) => {
  if (!evt || evt.from === "3d") return;
  postToIframe("broadcast", evt.data);
};

const onMessage = (e: MessageEvent) => {
  const data = e.data;
  if (!data || data.source !== "PanelIframe") return;
  if (data.type === "close") {
    close();
    return;
  }
  if (data.type === "broadcast") {
    EventBus.emit(IFRAME_BROADCAST_EVENT as any, { from: "3d", data });
  }
};

onMounted(() => {
  window.addEventListener("message", onMessage);
  EventBus.on(NAV_FINISHED_EVENT as any, onNavFinished);
  EventBus.on(IFRAME_BROADCAST_EVENT as any, onBroadcast);
  EventBus.on('panelClose', close);
});

onUnmounted(() => {
  window.removeEventListener("message", onMessage);
  EventBus.off(NAV_FINISHED_EVENT as any, onNavFinished);
  EventBus.off(IFRAME_BROADCAST_EVENT as any, onBroadcast);
  EventBus.off('panelClose', close);
});

watch(visible, (v: boolean) => {
  v && postToIframe("open", { name: props.name || "3D" });
});
</script>

<template>
  <div
    v-if="visible"
    class="iframe_panel"
    :style="{
      top: `${top ?? 442}px`,
      width: `${width ?? 420}px`,
      height: `${height ?? 380}px`,
    }"
  >
    <div class="iframe_panel_header">
      <div class="iframe_panel_title">{{ name || "3D面板" }}</div>
      <button class="iframe_panel_close" type="button" @click="close">×</button>
    </div>
    <div class="iframe_panel_body">
      <iframe
        ref="iframeRef"
        :src="src || 'about:blank'"
        class="iframe_panel_iframe"
      />
    </div>
  </div>
</template>

<style scoped>
.iframe_panel {
  position: fixed;
  right: 12px;
  z-index: 79;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(8px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.iframe_panel_header {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.iframe_panel_title {
  font-size: 13px;
  color: #111827;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.iframe_panel_close {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  line-height: 1;
}

.iframe_panel_body {
  flex: 1;
}

.iframe_panel_iframe {
  width: 100%;
  height: 100%;
  border: 0;
}
</style>
