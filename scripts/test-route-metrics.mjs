import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const modulePath = path.resolve("src/baseComponent/amap/routeMetrics.ts");
const source = fs.readFileSync(modulePath, "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});

const mod = { exports: {} };
const load = new Function("exports", "module", outputText);
load(mod.exports, mod);

const {
  computeRouteMetrics,
  distanceMeters,
  formatCountdownSeconds,
} = mod.exports;

const longRoute = [
  [0, 0],
  [0, 0.02],
];
const longMetrics = computeRouteMetrics(longRoute, 1000);

assert.equal(longMetrics.distanceIndexMeters.length, 2);
assert.equal(longMetrics.distanceIndexMeters[0], 0);
assert.ok(longMetrics.totalDistanceMeters > 2220);
assert.ok(longMetrics.totalDistanceMeters < 2228);
assert.equal(
  Math.round(longMetrics.lastMileStartDistanceMeters),
  Math.round(longMetrics.totalDistanceMeters - 1000),
);
assert.ok(longMetrics.lastMileStartPoint);
assert.ok(
  Math.abs(distanceMeters(longMetrics.lastMileStartPoint, longRoute[1]) - 1000) < 2,
);

const shortRoute = [
  [113.5, 22.2],
  [113.5005, 22.2005],
];
const shortMetrics = computeRouteMetrics(shortRoute, 1000);
assert.equal(shortMetrics.lastMileStartDistanceMeters, 0);
assert.deepEqual(shortMetrics.lastMileStartPoint, shortRoute[0]);

assert.equal(formatCountdownSeconds(0), "00:00");
assert.equal(formatCountdownSeconds(61), "01:01");
assert.equal(formatCountdownSeconds(3661), "61:01");

console.log("route metrics tests passed");
