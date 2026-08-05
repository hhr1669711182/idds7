import test from "node:test";
import assert from "node:assert/strict";

import {
  JRAlarmList,
  zhxfdzXYList,
} from "../src/baseComponent/amap/mapData.ts";
import { gcj02ToWgs84 } from "../src/baseComponent/tools/transform.ts";

const assertClose = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("station export uses WGS84 lng/lat converted from the original GCJ02 data", () => {
  const station = zhxfdzXYList[0];
  const [expectedLng, expectedLat] = gcj02ToWgs84(113.51872, 22.276434);

  assertClose(station.lng, expectedLng);
  assertClose(station.lat, expectedLat);
  assert.equal("wgs84Lng" in station, false);
  assert.equal("wgs84Lat" in station, false);
});

test("alarm export uses WGS84 lng/lat converted from the original GCJ02 data", () => {
  const alarm = JRAlarmList[0];
  const [expectedLng, expectedLat] = gcj02ToWgs84(113.579614, 22.275568);

  assertClose(alarm.lng, expectedLng);
  assertClose(alarm.lat, expectedLat);
  assert.equal("wgs84Lng" in alarm, false);
  assert.equal("wgs84Lat" in alarm, false);
});
