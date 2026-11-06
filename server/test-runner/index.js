'use strict';
// 场景执行引擎：步骤化推送 + 连接断言，结果写入 runs（执行中持续更新，UI 轮询可见）。
// 控制通道（control）由调用方注入：
//   - createInProcessControl：test-harness 用（同进程直连 clients Map，复用 routing.filterFrame 语义）
//   - WsControl（./client.js）：cli.js 用（连 /mock-control，等价 __test 控制台）
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { build } = require('../protocols');
const { filterFrame } = require('../routing');

const REPORT_DIR = path.join(__dirname, 'reports');
const runs = new Map(); // runId → report
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** 目标身份默认值（对齐 __test 控制台的历史用法，UI 可覆盖） */
const DEFAULT_TARGETS = { userId: 'alarm-debug-user', sessionState: 'alarm-debug-session' };

function createInProcessControl({ clients }) {
  return {
    async listClients() {
      return [...clients.values()].map(c => ({ ...c, subscriptions: [...c.subscriptions] }));
    },
    async push(message, { userId, sessionState, respectSubscriptions = true } = {}) {
      // 与 mock-ws.js 控制台 push 分支同一套语义：userId/sessionState 过滤 → clientId 隔离 → topic 订阅过滤
      let matched = 0;
      let delivered = 0;
      for (const [ws, info] of clients) {
        if (userId && info.userId !== userId) continue;
        if (sessionState && info.sessionState !== sessionState) continue;
        if (ws.readyState !== 1 /* OPEN */) continue;
        matched++;
        if (message && typeof message === 'object' && !Array.isArray(message) && message.clientId && message.clientId !== info.clientId) continue;
        const out = respectSubscriptions ? filterFrame(message, info.subscriptions) : message;
        if (out === null && message !== null) continue;
        ws.send(typeof out === 'string' ? out : JSON.stringify(out));
        delivered++;
      }
      return { matched, delivered };
    },
  };
}

async function checkConnected(step, control, targets) {
  const clients = await control.listClients();
  const online = clients.filter(c => c && typeof c.userId === 'string');
  if (!targets.userId && !targets.sessionState) {
    if (!online.length) return { status: 'FAIL', detail: '无前端客户端连接 /message-client/ws' };
    return { status: 'PASS', detail: `已连接 ${online.length} 个前端客户端（未指定目标，广播匹配）` };
  }
  const hit = online.find(c =>
    (!targets.userId || c.userId === targets.userId)
    && (!targets.sessionState || c.sessionState === targets.sessionState));
  if (!hit) return { status: 'FAIL', detail: `目标身份 ${targets.userId}/${targets.sessionState} 未连接（在线：${online.map(c => `${c.userId}/${c.sessionState}`).join(', ') || '无'}）` };
  return { status: 'PASS', detail: `${hit.userId}/${hit.sessionState} 已连接（${hit.clientId}），订阅 ${hit.subscriptions.length} 个 topic` };
}

async function pushOne(control, targets, kind, options) {
  const msg = build(kind, options);
  const { matched, delivered } = await control.push(msg, {
    userId: targets.userId,
    sessionState: targets.sessionState,
  });
  if (matched === 0) return { status: 'FAIL', detail: `无客户端匹配（kind=${kind}，topics=${msg.topics.join(',')}）` };
  if (delivered === 0) return { status: 'FAIL', detail: `已匹配 ${matched} 个客户端但均未投递：topic 未订阅或 clientId 不一致（kind=${kind}）` };
  return { status: 'PASS', detail: `投递 ${delivered}/${matched}（kind=${kind}，topics=${msg.topics.join(',')}）` };
}

async function runScenario(def, opts, control) {
  const targets = { ...DEFAULT_TARGETS, ...(opts.targets || {}) };
  const runId = opts.runId || randomUUID();
  const report = {
    runId,
    scenario: def.key,
    label: def.label,
    full: !!opts.full,
    targets,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    summary: null,
    steps: def.steps
      .filter(s => opts.full || s.tag !== 'extra')
      .map(s => ({ id: s.id, name: s.name, status: 'PENDING', detail: '' })),
  };
  runs.set(runId, report);

  // 本次运行的业务 id（每 run 独立，避免跨 run 串数据）
  const ids = {
    id: runId.slice(0, 8),
    incidentId: `INC-${runId.slice(0, 8)}`,
    callId: `CALL-${runId.slice(0, 8)}`,
    baseTime: new Date().toISOString(),
  };
  const active = report.steps;
  for (const step of active) {
    const def0 = def.steps.find(s => s.id === step.id);
    const t0 = Date.now();
    try {
      if (def0.type === 'connect') {
        const r = await checkConnected(def0, control, targets);
        step.status = r.status;
        step.detail = r.detail;
      } else if (def0.type === 'push') {
        const r = await pushOne(control, targets, def0.kind, { ...def0.options, incidentId: ids.incidentId, callId: ids.callId });
        step.status = r.status;
        step.detail = r.detail;
      } else if (def0.type === 'flow') {
        // 警情状态顺序流转（incidentStates 全集子序列）
        const states = def0.states;
        for (let i = 0; i < states.length; i++) {
          const r = await pushOne(control, targets, 'incident', { ...def0.options, incidentState: states[i], time: new Date(Date.now()).toISOString() });
          if (r.status === 'FAIL') {
            step.status = 'FAIL';
            step.detail = `状态 ${states[i]}（${i + 1}/${states.length}）：${r.detail}`;
            break;
          }
          if (i < states.length - 1) await sleep(def0.holdMs ?? 500);
        }
        if (step.status !== 'FAIL') {
          step.status = 'PASS';
          step.detail = `状态流转 ${states.join(' → ')}（${states.length} 次推送）`;
        }
      } else if (def0.type === 'seq') {
        // 车辆轨迹序列（复用 protocols.carPoints 真实路径）
        const count = def0.count ?? 10;
        let failed = 0;
        for (let i = 0; i < count; i++) {
          const r = await pushOne(control, targets, 'car', {
            ...def0.options,
            routeIndex: def0.routeIndex ?? 0,
            pointIndex: i,
            interval: def0.intervalMs ?? 500,
            time: new Date(Date.parse(ids.baseTime) + i * (def0.intervalMs ?? 500)).toISOString(),
          });
          if (r.status === 'FAIL') failed++;
          if (r.status === 'FAIL' && !targets.userId) { step.status = 'FAIL'; step.detail = `点 ${i + 1}/${count}：${r.detail}`; break; }
        }
        if (failed === 0) { step.status = 'PASS'; step.detail = `轨迹 ${count} 点推送完成（路径 ${def0.routeIndex ?? 0}）`; }
        else if (step.status !== 'FAIL') { step.status = 'FAIL'; step.detail = `${failed}/${count} 点投递失败` };
      } else if (def0.type === 'wait') {
        await sleep(def0.ms ?? 1000);
        step.status = 'PASS';
        step.detail = `等待 ${def0.ms ?? 1000}ms（观察前端响应窗口）`;
      } else if (def0.type === 'geoassert') {
        // 可选：GeoServer CQL 回查（未配置 GEOSERVER_URL 时 SKIP，不阻塞流程）
        const base = process.env.GEOSERVER_URL || def0.geoserver;
        if (!base || !def0.layer) {
          step.status = 'SKIP';
          step.detail = '未配置 GEOSERVER_URL（env 或步骤参数），跳过 CQL 回查';
        } else {
          const url = `${base.replace(/\/$/, '')}/${def0.layer}/wms?service=WMS&version=1.1.1&request=GetFeature&typename=${def0.layer}&outputFormat=application/json`
            + (def0.cql ? `&CQL_FILTER=${encodeURIComponent(def0.cql)}` : '');
          const resp = await fetch(url);
          const body = await resp.text();
          const count = (body.match(/"geometry"/g) || []).length;
          step.status = resp.ok ? 'PASS' : 'FAIL';
          step.detail = `CQL 回查 ${def0.layer}（HTTP ${resp.status}）：${count} 个 feature`;
        }
      } else {
        step.status = 'SKIP';
        step.detail = `未知步骤类型：${def0.type}`;
      }
    } catch (error) {
      step.status = 'FAIL';
      step.detail = `异常：${error.message}`;
    }
    step.ms = Date.now() - t0;
  }

  const failed = report.steps.filter(s => s.status === 'FAIL').length;
  const skipped = report.steps.filter(s => s.status === 'SKIP').length;
  report.finishedAt = new Date().toISOString();
  report.summary = failed ? `${failed} 项失败 / ${skipped} 项跳过（共 ${report.steps.length} 步）` : `全部通过（${report.steps.length} 步${skipped ? `，${skipped} 项跳过` : ''}）`;

  // 报告落盘（执行中已可通过 runs Map 轮询）
  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORT_DIR, `${report.startedAt.replace(/[:.]/g, '-')}-${def.key}-${runId.slice(0, 8)}.json`), JSON.stringify(report, null, 2));
  } catch { /* 报告目录不可写不影响执行 */ }
  return report;
}

function listRuns() {
  return [...runs.values()].map(r => ({
    runId: r.runId, scenario: r.scenario, label: r.label, startedAt: r.startedAt,
    finishedAt: r.finishedAt, summary: r.summary,
    steps: r.steps.map(s => ({ id: s.id, name: s.name, status: s.status })),
  })).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function getRun(runId) {
  const r = runs.get(runId);
  if (!r) return null;
  return { ...r, steps: r.steps.map(s => ({ ...s })) };
}

module.exports = { createInProcessControl, runScenario, getRun, listRuns, DEFAULT_TARGETS };
