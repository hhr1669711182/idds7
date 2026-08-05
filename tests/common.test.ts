import test from "node:test";
import assert from "node:assert/strict";

import { getLocationType } from "../src/baseComponent/tools/Common.ts";

test("maps location type codes to display labels", () => {
  assert.equal(getLocationType("SJDW"), "手机定位");
  assert.equal(getLocationType("WZWDW-GPS_s"), "位置网精准定位");
  assert.equal(getLocationType("unknown"), "未知");
  assert.equal(getLocationType(), "未知");
});
