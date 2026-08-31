/*
 * @Author: huanghuanrong
 * @Date: 2026-08-31 10:00:00
 * @LastEditTime: 2026-08-31 10:00:00
 * @LastEditors: hhr
 * @Description: 生产构建前的独立问题排查命令:跑 vue-tsc 类型校验,过滤掉仓库预存
 * 的 baseUrl 弃用提示(error TS5101),剩下的任何 TS / vue-tsc 报错都会以 exit 1 退出。
 * 独立于 build:prod,不挂在 prebuild 上,需要时手动调用 npm run lint:tsc。
 *
 * 用法:
 *   node scripts/lint-tsc.mjs            默认走 vue-tsc,支持 .vue
 *   node scripts/lint-tsc.mjs --ts-only  降级到 tsc --noEmit(只查 .ts/.d.ts)
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);
const tsOnly = args.includes("--ts-only");

// 仓库预存但与本次构建无关的告警,集中维护。命中这些规则字符串才放行,其它一律视为错误。
const KNOWN_BENIGN_PATTERNS = [
  // tsconfig.json 启用了旧版 baseUrl,TS6 计划弃用,但本仓库未升级,所以长期存在。
  /error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7\.0/,
  // 紧随 TS5101 的迁移提示,只对 baseUrl 弃用场景出现。
  /Visit https:\/\/aka\.ms\/ts6 for migration information/,
];

const isBenign = (line) => KNOWN_BENIGN_PATTERNS.some((re) => re.test(line));

// 通过 npx 调用,确保 PATH 中没有 tsc / vue-tsc 时也能找到本地 devDependency
// npx 会在 node_modules/.bin 下查找,把第一个参数当包名,剩余参数原样透传
const run = (cmd, cmdArgs) =>
  // 使用 -- 分隔 npx 自身的参数与要执行的包参数 (npm/npx 11 之后 --no 等 config flag 已废弃)
  spawnSync("npx", ["--", cmd, ...cmdArgs], {
    cwd: process.cwd(),
    stdio: ["inherit", "pipe", "inherit"],
    shell: process.platform === "win32",
    encoding: "utf8",
  });

const printBanner = (text) => {
  const sep = "=".repeat(72);
  console.log("");
  console.log(sep);
  console.log("  " + text);
  console.log(sep);
  console.log("");
};

const filterBenign = (text) =>
  (text ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !isBenign(line))
    .join("\n");

const main = () => {
  // 优先 vue-tsc,能覆盖 .vue 内 <script lang="ts">;--ts-only 时降级到 tsc
  // npx 调用,确保 PATH 中没有 vue-tsc / tsc 时也能找到本地 devDependency
  const cmd = tsOnly ? "tsc" : "vue-tsc";
  const cmdArgs = ["--noEmit", "-p", "tsconfig.json"];

  printBanner("[lint:tsc] 执行类型校验: " + cmd + " " + cmdArgs.join(" "));

  const result = run(cmd, cmdArgs);
  const filteredStdout = filterBenign(result.stdout);
  const filteredStderr = filterBenign(result.stderr);

  if (filteredStdout) {
    process.stdout.write(filteredStdout);
    if (!filteredStdout.endsWith("\n")) process.stdout.write("\n");
  }
  if (filteredStderr) {
    process.stderr.write(filteredStderr);
    if (!filteredStderr.endsWith("\n")) process.stderr.write("\n");
  }

  // 退出码非零 且 过滤后还有未识别输出,才视为真实错误。
  // 如果非零退出码来自 TS5101 等预存良性告警,过滤后 stdio 为空,不应当成失败。
  const hasRealError = filteredStdout.length > 0 || filteredStderr.length > 0;
  if (hasRealError) {
    console.error("\n[lint:tsc] \u274c 类型校验未通过,请按上方错误定位修复\n");
    process.exit(1);
  }

  console.log("\n[lint:tsc] \u2705 类型校验通过,可以执行构建\n");
  process.exit(0);
};

main();