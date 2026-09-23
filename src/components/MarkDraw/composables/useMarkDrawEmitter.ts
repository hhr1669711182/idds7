/**
 * Vue 与 engine emitter 双向绑定：onUnmounted 自动 off
 */
import { onBeforeUnmount } from "vue";
import type {
  CreateMarkDrawEngineResult,
} from "../engine/createMarkDrawEngine";
import type { MarkDrawEventName, MarkDrawEventMap } from "../engine/types";

export const useMarkDrawEmitter = (
  engine: CreateMarkDrawEngineResult,
  handlers: Partial<{
    [K in MarkDrawEventName]: (payload: MarkDrawEventMap[K]) => void;
  }>
) => {
  const offs: Array<() => void> = [];
  (Object.keys(handlers) as MarkDrawEventName[]).forEach((key) => {
    const fn = handlers[key];
    if (fn) offs.push(engine.on(key, fn as never));
  });
  onBeforeUnmount(() => {
    offs.forEach((off) => off());
  });
};
