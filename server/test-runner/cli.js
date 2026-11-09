'use strict';
// 独立 CLI 运行器：node server/test-runner/cli.js [mode] [--full] [--target user/session] [--url ws://host:port/mock-control]
// 与 test-harness（进程内）同一套引擎，区别是控制端走 /mock-control WS。
const { WsControl } = require('./client');
const { runScenario, getRun } = require('./index');
const { loadModes, getScenario } = require('./registry');

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const hasFlag = name => args.includes(name);

async function main() {
  const modeKey = args.find(a => !a.startsWith('--')) || 'dispatch';
  const url = flag('url') || process.env.MOCK_CONTROL_URL || 'ws://127.0.0.1:18080/mock-control';
  const targetArg = flag('target');
  const targets = targetArg ? targetArg.split('/').map(s => s.trim()) : undefined;

  const control = new WsControl(url);
  await control.connect();
  console.log(`已连接 ${url}`);
  const online = await control.listClients();
  console.log(`在线客户端：${online.length ? online.map(c => `${c.userId}/${c.sessionState}（${c.subscriptions.length} 订阅）`).join(', ') : '无'}`);

  const def = getScenario(modeKey);
  if (!def) {
    console.error(`未知模式：${modeKey}，可用：${loadModes().map(m => m.key).join(', ')}`);
    control.close();
    process.exit(2);
  }

  const report = await runScenario(def, {
    full: hasFlag('full'),
    targets: targets ? { userId: targets[0], sessionState: targets[1] } : undefined,
  }, control);

  for (const s of report.steps) {
    console.log(`  [${s.status.padEnd(4)}] ${s.name} — ${s.detail}（${s.ms}ms）`);
  }
  console.log(`\n结果：${report.summary}（runId=${report.runId}，报告已存 server/test-runner/reports/）`);
  if (report.stateSequence) console.log(`展示模式轨迹：${report.stateSequence}`);
  const gateWarns = report.steps.filter(s => s.gateWarn).map(s => `${s.id}: ${s.gateWarn}`);
  if (gateWarns.length) {
    console.log(`门禁自检告警（${gateWarns.length}）：`);
    gateWarns.forEach(w => console.log('  ⚠ ' + w));
  }
  control.close();
  process.exit(report.summary.startsWith('全部通过') || report.summary.includes('失败 0') ? 0 : 1);
}

main().catch(error => { console.error(error.message); process.exit(1); });
