import { defineStore } from "pinia";
import { ref } from "vue";

import {
  createDefaultMapConfig,
  fetchMapConfig,
  getToolbarLayerConfigs,
  getVisibleLayerIds,
  normalizeMapConfig,
  saveMapConfig,
  type MapConfigPayload,
} from "@/config/mapConfig.ts";
import { useLayersStore } from "./useLayersStore.ts";

export const useMapConfigStore = defineStore(
  "mapConfig",
  () => {
    const config = ref<MapConfigPayload>(createDefaultMapConfig());
    const loading = ref(false);
    const saving = ref(false);
    const loaded = ref(false);

    const syncLayers = (payload = config.value) => {
      const layersStore = useLayersStore();
      layersStore.setLayerConfigs(getToolbarLayerConfigs(payload), {
        checkedIds: getVisibleLayerIds(payload),
      });
    };

    const loadConfig = async () => {
      if (loading.value) return config.value;

      loading.value = true;
      try {
        config.value = normalizeMapConfig(await fetchMapConfig());
        loaded.value = true;
        syncLayers(config.value);
        return config.value;
      } finally {
        loading.value = false;
      }
    };

    const saveConfig = async (payload: MapConfigPayload) => {
      saving.value = true;
      try {
        config.value = normalizeMapConfig(await saveMapConfig(payload));
        loaded.value = true;
        syncLayers(config.value);
        return config.value;
      } finally {
        saving.value = false;
      }
    };

    return {
      config,
      loaded,
      loading,
      saving,
      loadConfig,
      saveConfig,
      syncLayers,
    };
  },
);
