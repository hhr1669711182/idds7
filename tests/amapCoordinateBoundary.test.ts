/*
 * @Author: hhr
 * @Date: 2026-05-22 14:34:53
 * @LastEditTime: 2026-08-06 09:51:23
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\tests\amapCoordinateBoundary.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  amapGcj02ToWgs84,
  parseAmapLocation,
  parsePolyline,
  toAmapGcj02,
  toAmapLngLatString,
} from "../src/baseComponent/amap/amapCoordinate.ts";
import {
  gcj02ToWgs84,
  wgs84ToGcj02,
} from "../src/baseComponent/tools/transform.ts";

const assertClose = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("converts AMap GCJ02 coordinates to WGS84 at inbound boundaries", () => {
  const gcj02 = [113.579614, 22.275568] as const;
  const expected = gcj02ToWgs84(gcj02[0], gcj02[1]);

  const fromTuple = amapGcj02ToWgs84(gcj02);
  const fromString = parseAmapLocation(`${gcj02[0]},${gcj02[1]}`)!;

  assertClose(fromTuple[0], expected[0]);
  assertClose(fromTuple[1], expected[1]);
  assertClose(fromString[0], expected[0]);
  assertClose(fromString[1], expected[1]);
});

test("converts WGS84 coordinates to AMap GCJ02 at outbound boundaries", () => {
  const gcj02 = [113.579614, 22.275568] as const;
  const wgs84 = gcj02ToWgs84(gcj02[0], gcj02[1]);
  const outbound = toAmapGcj02(wgs84);
  const [stringLng, stringLat] = toAmapLngLatString(wgs84)
    .split(",")
    .map(Number);

  assertClose(outbound[0], wgs84ToGcj02(wgs84[0], wgs84[1])[0]);
  assertClose(outbound[1], wgs84ToGcj02(wgs84[0], wgs84[1])[1]);
  assertClose(stringLng, outbound[0]);
  assertClose(stringLat, outbound[1]);
});

test("parses AMap route polylines into WGS84 coordinates", () => {
  const gcj02A = [113.579614, 22.275568] as const;
  const gcj02B = [113.575899, 22.274667] as const;
  const route = parsePolyline(`${gcj02A.join(",")};${gcj02B.join(",")}`);
  const expectedA = gcj02ToWgs84(gcj02A[0], gcj02A[1]);
  const expectedB = gcj02ToWgs84(gcj02B[0], gcj02B[1]);

  assert.equal(route.length, 2);
  assertClose(route[0][0], expectedA[0]);
  assertClose(route[0][1], expectedA[1]);
  assertClose(route[1][0], expectedB[0]);
  assertClose(route[1][1], expectedB[1]);
});
