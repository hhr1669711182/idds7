import test from "node:test";
import assert from "node:assert/strict";
import { fromLonLat, transform } from "ol/proj.js";
import type { TileCoord } from "ol/tilecoord.js";

import {
  createBaiduSource,
  registerBaiduProjection,
} from "../src/baseComponent/tools/baidu.ts";

const tileUrl = (mapType: "road" | "image", tileCoord: TileCoord) => {
  const projection = registerBaiduProjection();
  const source = createBaiduSource({ mapType });
  return source.getTileUrlFunction()(tileCoord, 1, projection);
};

const assertClose = (actual: number, expected: number, tolerance = 1e-5) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("registers the Baidu projection once", () => {
  const first = registerBaiduProjection();
  const second = registerBaiduProjection();

  assert.equal(first, second);
  assert.equal(first.getCode(), "baidu");
});

test("creates road and image tile urls", () => {
  const roadUrl = tileUrl("road", [10, 12, -4]);
  const imageUrl = tileUrl("image", [10, 12, -4]);

  assert.match(roadUrl ?? "", /online4\.map\.bdimg\.com\/tile/);
  assert.match(roadUrl ?? "", /x=12&y=3&z=10/);
  assert.match(roadUrl ?? "", /styles=pl/);

  assert.match(imageUrl ?? "", /shangetu0\.map\.bdimg\.com\/it\/u=x=12;y=3;z=10/);
  assert.match(imageUrl ?? "", /type=sate/);
});

test("uses Baidu tile y coordinates instead of OpenLayers row coordinates", () => {
  const source = createBaiduSource({ mapType: "road" });
  const projection = source.getProjection()!;
  const tileGrid = source.getTileGrid()!;
  const baiduCoord = transform(
    fromLonLat([113.5437, 22.2657]),
    "EPSG:3857",
    projection,
  );
  const tileCoord = tileGrid.getTileCoordForCoordAndZ(baiduCoord, 14);
  const url = source.getTileUrlFunction()(tileCoord, 1, projection);

  assert.deepEqual(tileCoord, [14, 3086, -618]);
  assert.match(url ?? "", /x=3086&y=617&z=14/);
});

test("round-trips lonlat and Baidu mercator coordinates", () => {
  registerBaiduProjection();

  const lonLat = [116.397128, 39.916527];
  const mercator = transform(lonLat, "EPSG:4326", "baidu");
  const roundTrip = transform(mercator, "baidu", "EPSG:4326");

  assertClose(roundTrip[0], lonLat[0]);
  assertClose(roundTrip[1], lonLat[1]);
});
