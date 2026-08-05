import test from "node:test";
import assert from "node:assert/strict";

import { LAYER_SOURCE_CONFIGS } from "../src/config/layers.ts";
import {
  createDefaultMapConfig,
  fetchMapConfig,
  getToolbarLayerConfigs,
  getVisibleLayerIds,
  normalizeMapConfig,
  saveMapConfig,
} from "../src/config/mapConfig.ts";

test("map config builds grouped tree from the flat layer source", () => {
  const config = createDefaultMapConfig();
  const group = config.layer.groups[0];

  assert.equal(group.id, "dispatch");
  assert.deepEqual(
    group.categories.map((category) => category.id),
    ["water", "alarm", "combat", "safety"],
  );
  assert.deepEqual(
    group.categories.flatMap((category) => category.resources.map((resource) => resource.id)),
    LAYER_SOURCE_CONFIGS.map((resource) => resource.id),
  );
});

test("map config exposes enabled resources for the toolbar", () => {
  const config = createDefaultMapConfig();
  const resources = config.layer.groups.flatMap((group) =>
    group.categories.flatMap((category) => category.resources),
  );

  const disabledId = "gis:v_srvc_water_hydrant";
  const disabledResource = resources.find((resource) => resource.id === disabledId);
  if (disabledResource) disabledResource.enabled = false;

  assert.deepEqual(
    getToolbarLayerConfigs(config).map((layer) => layer.id),
    LAYER_SOURCE_CONFIGS.map((layer) => layer.id).filter((id) => id !== disabledId),
  );
});

test("map config converts visible resources to checked layer ids", () => {
  const config = createDefaultMapConfig();
  // Clear all visible states
  config.layer.groups.forEach((g) => g.categories.forEach((c) => c.resources.forEach((r) => r.visible = false)));
  
  const resource = config.layer.groups[0].categories[0].resources[0];
  resource.visible = true;

  assert.deepEqual(getVisibleLayerIds(config), [resource.id]);
});

test("normalizes disabled resources so they do not remain visible", () => {
  const config = createDefaultMapConfig();
  const resource = config.layer.groups[0].categories[0].resources[0];

  resource.enabled = false;
  resource.visible = true;

  const normalized = normalizeMapConfig(config);
  const normalizedResource = normalized.layer.groups[0].categories[0].resources[0];

  assert.equal(normalizedResource.enabled, false);
  assert.equal(normalizedResource.visible, false);
  assert.equal(getToolbarLayerConfigs(normalized).some((layer) => layer.id === resource.id), false);
});

test("persists saved map config across module reloads", async () => {
  const storage = new Map<string, string>();
  const originalStorage = Reflect.get(globalThis, "localStorage");

  Reflect.set(globalThis, "localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });

  try {
    const config = createDefaultMapConfig();
    config.feature.maxZoom = 17;
    config.layer.groups[0].categories[0].resources[0].visible = true;

    await saveMapConfig(config);
    const loadedInSameSession = await fetchMapConfig();
    const freshModule = await import(`../src/config/mapConfig.ts?persist=${Date.now()}`);
    const loadedAfterReload = await freshModule.fetchMapConfig();

    assert.equal(loadedInSameSession.feature.maxZoom, 17);
    assert.equal(loadedAfterReload.feature.maxZoom, 17);
    assert.deepEqual(freshModule.getVisibleLayerIds(loadedAfterReload), ["gis:v_srvc_water_hydrant"]);
  } finally {
    if (originalStorage === undefined) {
      Reflect.deleteProperty(globalThis, "localStorage");
    } else {
      Reflect.set(globalThis, "localStorage", originalStorage);
    }
  }
});
