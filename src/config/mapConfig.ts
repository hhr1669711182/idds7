import {
  LAYER_SOURCE_CONFIGS,
  toLayerConfig,
  type LayerConfig,
  type LayerSourceConfig,
} from "./layers.ts";

export type ConfigTab = "feature" | "layer";
export type MapMode = "dispatch" | "oneMap";

export interface FeatureSettings {
  minZoom: number;
  maxZoom: number;
  alarmZoom: number;
  showNav: boolean;
  showDraw: boolean;
  showOther: boolean;
  showEagleEye: boolean;
  mapMode: MapMode;
  bufferKm: number;
  queryCustomPoi: boolean;
  showCaseClosedStyle: boolean;
  showUavTrack: boolean;
}

export interface MapLayerResource extends LayerConfig {
  order: number;
  enabled: boolean;
  visible: boolean;
}

export interface MapLayerCategory {
  id: string;
  name: string;
  order: number;
  visible: boolean;
  resources: MapLayerResource[];
}

export interface MapLayerGroup {
  id: string;
  name: string;
  order: number;
  visible: boolean;
  categories: MapLayerCategory[];
}

export interface MapConfigPayload {
  version: string;
  updatedAt: string;
  feature: FeatureSettings;
  layer: {
    groups: MapLayerGroup[];
  };
}

export const MAP_CONFIG_STORAGE_KEY = "ids-gis-map-config";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const sourceByLayerId = new Map(LAYER_SOURCE_CONFIGS.map((config) => [config.id, config]));
const sortByOrder = <T extends { order: number }>(items: T[]) =>
  [...items].sort((a, b) => a.order - b.order);

const mapById = <T extends { id: string }>(items: T[]) =>
  new Map(items.map((item) => [item.id, item]));

const getSavedState = (layer?: MapConfigPayload["layer"]) => {
  const groups = layer?.groups ?? [];
  const categories = new Map<string, MapLayerCategory>();
  const resources = new Map<string, MapLayerResource>();

  groups.forEach((group) => {
    group.categories.forEach((category) => {
      categories.set(`${group.id}:${category.id}`, category);
      category.resources.forEach((resource) => resources.set(resource.id, resource));
    });
  });

  return { groups: mapById(groups), categories, resources };
};

const createResource = (
  source: LayerSourceConfig,
  saved?: MapLayerResource,
): MapLayerResource => {
  const enabled = saved?.enabled ?? source.enabled;

  return {
    ...toLayerConfig(source),
    order: saved?.order ?? source.order,
    enabled,
    visible: enabled ? (saved?.visible ?? (source.visible || !!source.defaultVisible)) : false,
  };
};

export const buildLayerGroups = (
  layer?: MapConfigPayload["layer"],
): MapLayerGroup[] => {
  const saved = getSavedState(layer);
  const groups = new Map<string, MapLayerGroup>();

  LAYER_SOURCE_CONFIGS.forEach((source) => {
    const savedGroup = saved.groups.get(source.groupId);
    const savedCategory = saved.categories.get(`${source.groupId}:${source.categoryId}`);
    const group =
      groups.get(source.groupId) ??
      {
        id: source.groupId,
        name: source.groupName,
        order: savedGroup?.order ?? source.groupOrder,
        visible: false,
        categories: [],
      };
    const category =
      group.categories.find((item) => item.id === source.categoryId) ??
      {
        id: source.categoryId,
        name: source.categoryName,
        order: savedCategory?.order ?? source.categoryOrder,
        visible: false,
        resources: [],
      };

    category.resources.push(createResource(source, saved.resources.get(source.id)));
    if (!group.categories.some((item) => item.id === category.id)) {
      group.categories.push(category);
    }
    groups.set(group.id, group);
  });

  return sortByOrder(Array.from(groups.values())).map((group, groupIndex) => {
    const categories = sortByOrder(group.categories).map((category, categoryIndex) => {
      const resources = sortByOrder(category.resources).map((resource, resourceIndex) => ({
        ...resource,
        order: resourceIndex + 1,
        visible: resource.enabled ? resource.visible : false,
      }));

      return {
        ...category,
        order: categoryIndex + 1,
        visible: resources.some((resource) => resource.visible),
        resources,
      };
    });

    return {
      ...group,
      order: groupIndex + 1,
      visible: categories.some((category) => category.visible),
      categories,
    };
  });
};

export const createDefaultMapConfig = (): MapConfigPayload => ({
  version: "1",
  updatedAt: new Date().toISOString(),
  feature: {
    minZoom: 0,
    maxZoom: 21,
    alarmZoom: 18,
    showNav: true,
    showDraw: true,
    showOther: true,
    showEagleEye: true,
    mapMode: "dispatch",
    bufferKm: 0.2,
    queryCustomPoi: true,
    showCaseClosedStyle: true,
    showUavTrack: true,
  },
  layer: {
    groups: buildLayerGroups(),
  },
});

export const normalizeMapConfig = (payload: MapConfigPayload): MapConfigPayload => {
  const next = clone(payload);
  next.layer.groups = buildLayerGroups(next.layer);

  return next;
};

const stripResourceState = ({ order, enabled, visible, ...config }: MapLayerResource): LayerConfig => {
  const source = sourceByLayerId.get(config.id);
  return source ? toLayerConfig(source) : config;
};

export const getEnabledLayerConfigs = (payload: MapConfigPayload): LayerConfig[] =>
  normalizeMapConfig(payload).layer.groups.flatMap((group) =>
    group.categories.flatMap((category) =>
      category.resources
        .filter((resource) => resource.enabled)
        .map(stripResourceState),
    ),
  );

export const getToolbarLayerConfigs = (payload: MapConfigPayload): LayerConfig[] =>
  normalizeMapConfig(payload).layer.groups.flatMap((group) =>
    group.categories.flatMap((category) =>
      category.resources
        .filter((resource) => resource.enabled)
        .map(stripResourceState),
    ),
  );

export const getVisibleLayerIds = (payload: MapConfigPayload): string[] =>
  normalizeMapConfig(payload).layer.groups.flatMap((group) =>
    group.categories.flatMap((category) =>
      category.resources
        .filter((resource) => resource.enabled && resource.visible)
        .map((resource) => resource.id),
    ),
  );

type MapConfigStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const isMapConfigStorage = (value: unknown): value is MapConfigStorage =>
  !!value &&
  typeof (value as MapConfigStorage).getItem === "function" &&
  typeof (value as MapConfigStorage).setItem === "function" &&
  typeof (value as MapConfigStorage).removeItem === "function";

const getMapConfigStorage = (): MapConfigStorage | null => {
  try {
    const storage = globalThis.localStorage;
    return isMapConfigStorage(storage) ? storage : null;
  } catch {
    return null;
  }
};

const readStoredMapConfig = (): MapConfigPayload | null => {
  const storage = getMapConfigStorage();
  const raw = storage?.getItem(MAP_CONFIG_STORAGE_KEY);
  if (!raw) return null;

  try {
    return normalizeMapConfig(JSON.parse(raw) as MapConfigPayload);
  } catch {
    storage?.removeItem(MAP_CONFIG_STORAGE_KEY);
    return null;
  }
};

const writeStoredMapConfig = (payload: MapConfigPayload) => {
  try {
    getMapConfigStorage()?.setItem(MAP_CONFIG_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // The in-memory mock still works when storage is unavailable or full.
  }
};

let mockConfig = readStoredMapConfig() ?? createDefaultMapConfig();

export const fetchMapConfig = async (): Promise<MapConfigPayload> => {
  mockConfig = readStoredMapConfig() ?? mockConfig;
  return clone(mockConfig);
};

export const saveMapConfig = async (
  payload: MapConfigPayload,
): Promise<MapConfigPayload> => {
  mockConfig = normalizeMapConfig({
    ...payload,
    updatedAt: new Date().toISOString(),
  });
  writeStoredMapConfig(mockConfig);
  return clone(mockConfig);
};
