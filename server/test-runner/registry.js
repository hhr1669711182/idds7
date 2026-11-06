'use strict';
// 模式注册表：auto-discover modes/ 下所有场景（新增模式文件即自动可用，无需改注册表）
const fs = require('node:fs');
const path = require('node:path');

function loadModes() {
  const dir = path.join(__dirname, 'modes');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !f.startsWith('_'));
  const modes = [];
  for (const file of files) {
    try {
      const scenario = require(path.join(dir, file));
      if (scenario && scenario.key && Array.isArray(scenario.steps)) {
        modes.push({ key: scenario.key, label: scenario.label, file });
      }
    } catch (error) {
      modes.push({ key: file, label: `加载失败：${error.message}`, file, broken: true });
    }
  }
  return modes;
}

function getScenario(key) {
  const file = path.join(__dirname, 'modes', `${key}.js`);
  if (!fs.existsSync(file)) return null;
  return require(file);
}

module.exports = { loadModes, getScenario };
