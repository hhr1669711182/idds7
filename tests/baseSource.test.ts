import test from "node:test";
import assert from "node:assert/strict";
import {
  BASE_SOURCE_GROUPS,
  BASE_SOURCE_OPTIONS,
  DEFAULT_BASE_SOURCE_ID,
  createBaseSourceSource,
  getBaseSourceById,
} from "../src/baseComponent/OpenlayersMap/baseSource.ts";

test("base source registry exposes seven providers with image and road variants", () => {
  assert.equal(BASE_SOURCE_GROUPS.length, 7);
  assert.equal(BASE_SOURCE_OPTIONS.length, 14);

  for (const group of BASE_SOURCE_GROUPS) {
    assert.equal(group.options.length, 2);
    assert.deepEqual(
      group.options.map((option) => option.mode),
      ["image", "road"],
    );
  }
});

test("default base source stays on Amap road", () => {
  assert.equal(DEFAULT_BASE_SOURCE_ID, "amap-road");
  assert.equal(getBaseSourceById(DEFAULT_BASE_SOURCE_ID)?.providerId, "amap");
});

test("night mode only attaches to supported sources", () => {
  const amapDay = createBaseSourceSource("amap-road");
  const amapNight = createBaseSourceSource("amap-road", { night: true });
  const googleDay = createBaseSourceSource("google-road");
  const googleNight = createBaseSourceSource("google-road", { night: true });

  assert.notEqual(
    amapDay.getTileLoadFunction(),
    amapNight.getTileLoadFunction(),
  );
  assert.equal(
    googleDay.getTileLoadFunction(),
    googleNight.getTileLoadFunction(),
  );
});

test("Baidu source options use the shared Baidu source factory", () => {
  const baiduRoad = createBaseSourceSource("baidu-road");
  const baiduImage = createBaseSourceSource("baidu-image");

  assert.equal(baiduRoad.getProjection()?.getCode(), "baidu");
  assert.equal(baiduImage.getProjection()?.getCode(), "baidu");

  const roadUrl = baiduRoad.getTileUrlFunction()([10, 12, -4], 1, baiduRoad.getProjection()!);
  const imageUrl = baiduImage.getTileUrlFunction()([10, 12, -4], 1, baiduImage.getProjection()!);

  assert.match(roadUrl ?? "", /online4\.map\.bdimg\.com\/tile/);
  assert.match(imageUrl ?? "", /shangetu0\.map\.bdimg\.com\/it/);
});
