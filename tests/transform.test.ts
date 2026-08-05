import test from "node:test";
import assert from "node:assert/strict";

import {
  bd09ToGcj02,
  gcj02ToBd09,
  gcj02ToWgs84,
  wgs84ToGcj02,
} from "../src/baseComponent/tools/transform.ts";

const assertClose = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("converts WGS84 coordinates inside China to GCJ02", () => {
  const [lon, lat] = wgs84ToGcj02(116.397128, 39.916527);

  assertClose(lon, 116.40337249402477);
  assertClose(lat, 39.91793074924595);
});

test("keeps WGS84 coordinates outside China unchanged", () => {
  assert.deepEqual(wgs84ToGcj02(-73.9857, 40.7484), [-73.9857, 40.7484]);
  assert.deepEqual(gcj02ToWgs84(-73.9857, 40.7484), [-73.9857, 40.7484]);
});

test("round-trips GCJ02 and BD09 coordinates with small drift", () => {
  const gcj02 = [116.40337249402477, 39.91793074924595] as const;
  const bd09 = gcj02ToBd09(gcj02[0], gcj02[1]);
  const roundTrip = bd09ToGcj02(bd09[0], bd09[1]);

  assertClose(bd09[0], 116.40973933698186);
  assertClose(bd09[1], 39.92426929401509);
  assertClose(roundTrip[0], gcj02[0], 1e-6);
  assertClose(roundTrip[1], gcj02[1], 1e-6);
});
