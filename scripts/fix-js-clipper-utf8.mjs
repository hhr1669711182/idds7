/*
 * @Author: huanghuanrong
 * @Date: 2026-04-13 16:40:48
 * @LastEditTime: 2026-04-23 19:03:28
 * @LastEditors: hhr
 * @Description: 文件描述
 * @FilePath: \ids-gis-web\scripts\fix-js-clipper-utf8.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";

const projectRoot = process.cwd();
const target = path.join(projectRoot, "node_modules", "js-clipper", "clipper.js");

const isStrictUtf8 = (buf) => {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
};

if (!fs.existsSync(target)) {
  process.exit(0);
}

const buf = fs.readFileSync(target);
if (isStrictUtf8(buf)) {
  process.exit(0);
}

const text = buf.toString("latin1");
fs.writeFileSync(target, text, "utf8");

const after = fs.readFileSync(target);
if (!isStrictUtf8(after)) {
  process.exit(1);
}
