'use strict';
// 环境假数据加载器：按 env（dev/test/uat）返回对应城市的基准数据（坐标/队站/车辆）。
// 三套数据共享同一套数据形态切换（withTrack/noTrack/...），仅底层地理信息随 env 变化。
const path = require('node:path');

const ENV_LIST = ['dev', 'test', 'uat'];
const DEFAULT_ENV = 'test';

const cache = new Map();

// 未知 env 回退默认（test），避免 mock 失效
function load(env) {
  const key = ENV_LIST.includes(env) ? env : DEFAULT_ENV;
  if (cache.has(key)) return cache.get(key);
  const mod = require(path.join(__dirname, `${key}.js`));
  cache.set(key, mod);
  return mod;
}

module.exports = { ENV_LIST, DEFAULT_ENV, getMockData: load };
