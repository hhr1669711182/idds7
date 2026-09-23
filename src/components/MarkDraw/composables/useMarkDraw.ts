/**
 * Vue composable：创建 engine 并绑定到组件生命周期。
 */
import { ref, shallowRef, onBeforeUnmount } from "vue";
import type { Map as OLMap } from "ol";
import { createMarkDrawEngine, type CreateMarkDrawEngineResult } from "../engine/createMarkDrawEngine";

export const useMarkDraw = (mapRef: { value: OLMap | null | undefined }) => {
  const engine = shallowRef<CreateMarkDrawEngineResult | null>(null);
  const ready = ref(false);

  const init = () => {
    if (!mapRef.value) return;
    if (engine.value) return;
    engine.value = createMarkDrawEngine(mapRef.value);
    ready.value = true;
  };

  onBeforeUnmount(() => {
    engine.value?.destroy();
    engine.value = null;
  });

  return { engine, ready, init };
};
