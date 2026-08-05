import test from "node:test";
import assert from "node:assert/strict";

import {
  commonSetting,
  getDispatchData,
} from "../src/components/BIM/module/commonSetting.js";

const assertClose = (actual: number, expected: number, tolerance = 1e-9) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

test("BIM dispatch data consumes WGS84 route paths without GCJ02 re-conversion", () => {
  const basePoint = [113.57457848012538, 22.278587375010183] as const;
  const nextPoint = [113.575, 22.279] as const;

  commonSetting.truckFullPath = [];
  commonSetting.searchRadius = 350;

  getDispatchData({
    alarmData: {
      gisX: basePoint[0],
      gisY: basePoint[1],
    },
    navPathPlanData: {
      [basePoint.join(",")]: {
        fullPath: [basePoint, nextPoint],
      },
    },
  });

  const path = commonSetting.truckFullPath.at(-1);
  assert.ok(path);
  assertClose(path[0][0], basePoint[0]);
  assertClose(path[0][1], basePoint[1]);
  assertClose(path[1][0], nextPoint[0]);
  assertClose(path[1][1], nextPoint[1]);
});
