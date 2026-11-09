'use strict';
// 场景执行引擎：步骤化推送 + 连接断言，结果写入 runs（执行中持续更新，UI 轮询可见）。
// 控制通道（control）由调用方注入：
//   - createInProcessControl：test-harness 用（同进程直连 clients Map，复用 routing.filterFrame 语义）
//   - WsControl（./client.js）：cli.js 用（走 /mock-control，等价 __test 控制台）
// 展示模式状态（stateLog）：各步按 kind 推导门禁目标态（KIND_STAGE → 可写 phase + currentAlarm），
// 引擎在推送「前」记入 report.stateLog（phase/mode/alarm/_stage 自检），test-ui 轮询增量写
// localStorage seat-shared-state，使前端门禁在消息到达时已就绪（messageStagePolicy）。
// 节奏：push/flow 步 PASS 后 sleep(afterMs) 地图交互观察窗；seq 点间真实 sleep(intervalMs)。
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { build } = require('../protocols');
const { filterFrame } = require('../routing');

const REPORT_DIR = path.join(__dirname, 'reports');
const runs = new Map(); // runId -> report
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** mock 测试专用身份（__test 控制台生成 mock JWT 用；真实前端登录身份走 connect 自动改绑） */
const MOCK_TEST_USER = 'gis-test-user';
const MOCK_TEST_SESSION = 'gis-test-session';
/** 目标身份默认值（未显式指定时广播匹配；UI/CLI 可覆盖） */
const DEFAULT_TARGETS = { userId: MOCK_TEST_USER, sessionState: MOCK_TEST_SESSION };

/**
 * connect 自动改绑：目标身份匹配不到在线客户端，但存在其他在线客户端（真实前端登录）时，
 * 改绑第一个在线客户端。仅对未显式指定目标的运行生效（调用方守卫）。
 * @returns {Promise<null | { userId: string, sessionState: string, note: string }>}
 */
async function autoRebindTargets(control, targets) {
  const online = (await control.listClients()).filter(c => c && typeof c.userId === 'string');
  const hit = online.find(c =>
    (!targets.userId || c.userId === targets.userId) &&
    (!targets.sessionState || c.sessionState === targets.sessionState)
  );
  if (hit) return null;
  const first = online[0];
  if (!first) return null;
  return {
    userId: first.userId,
    sessionState: first.sessionState,
    note: `目标 ${targets.userId}/${targets.sessionState} 无在线客户端，自动改绑首个在线 ${first.userId}/${first.sessionState}`,
  };
}

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

// ── 前端门禁镜像（与 src/utils/seatSharedState.getSharedMapStage 保持同构，用于自检）────────
// 各 push kind 消息在 messageStagePolicy.stages 中要求的前端 stage：
const KIND_STAGE = {
  received: 'inquiry',
  end: 'inquiry',
  missed: 'inquiry',
  position: 'popup',
  address: 'dispatch',
  incident: 'dispatch',
  car: 'dispatchTrack',
};
// 由 required stage 反推「可写 stored-state」（phase 只能是可写 MapPhase；dispatch 须经 inquiry+currentAlarm 推导）
function stageToWritable(stage) {
  switch (stage) {
    case 'popup': return { phase: 'popup', alarm: null };
    case 'inquiry': return { phase: 'inquiry', alarm: null };
    case 'dispatch': return { phase: 'inquiry', alarm: 'current' };
    case 'dispatchTrack': return { phase: 'dispatchTrack', alarm: 'current' };
    case 'onDuty': return { phase: 'onDuty', alarm: null };
    default: return { phase: 'onDuty', alarm: null };
  }
}
// 镜像前端 getSharedMapStage：由 stored-state(phase, 是否有 currentAlarm) 推出实际 stage
function mirrorStage(phase, hasAlarm) {
  if (phase === 'onDuty') return 'onDuty';
  if (phase === 'popup') return 'popup';
  if (phase === 'dispatchTrack') return 'dispatchTrack';
  if (phase === 'inquiry') return hasAlarm ? 'dispatch' : 'inquiry';
  return null; // 非法可写 phase（如直接写 'dispatch'）
}
// stateAlarm token 解析为具体值：'current'→incidentId / null→清空 / undefined→不动
function resolveAlarm(token, incidentId) {
  if (token === 'current') return incidentId;
  if (token === null) return null;
  return undefined;
}

/**
 * 记录展示模式状态到 report.stateLog（去重：phase/mode/alarm 均未变化则不追加）。
 * 调用方在步骤推送「前」调用，使门禁在消息到达时已就绪。
 * @returns {null | {at, phase?, mode?, alarm?}} 追加的条目（未变化返回 null）
 */
function recordState(report, statePhase, mode, stateAlarm, incidentId) {
  const alarm = resolveAlarm(stateAlarm, incidentId);
  if (statePhase === undefined && mode === undefined && stateAlarm === undefined) return null;
  const prev = report.stateLog.length ? report.stateLog[report.stateLog.length - 1] : {};
  const phase = statePhase !== undefined ? statePhase : prev.phase;
  const modeOut = mode !== undefined ? mode : prev.mode;
  const alarmOut = alarm !== undefined ? alarm : prev.alarm;
  const hasAlarm = alarmOut !== undefined && alarmOut !== null;
  if (prev.phase === phase && prev.mode === modeOut && prev.alarm === alarmOut) return null; // 未变化，去重
  // 自检：phase + currentAlarm 推不出 stage 为 null（合法可写态都应能推出有效 stage）
  const check = mirrorStage(phase, hasAlarm);
  const entry = { at: new Date().toISOString() };
  if (phase !== undefined && phase !== null) entry.phase = phase;
  if (modeOut !== undefined && modeOut !== null) entry.mode = modeOut;
  if (alarm !== undefined) entry.alarm = alarm; // 具体 incidentId / null（清空）
  entry._stage = check; // 自检镜像 stage（null=门禁将不匹配，test-ui/报告可读）
  report.stateLog.push(entry);
  return entry;
}

/**
 * 门禁前置：业务步推送「前」先同步展示模式状态，使消息到达时门禁已就绪。
 *  - push/flow/seq：按 kind/类型反推所需 stage，再落「可写 stored-state」（phase+currentAlarm），保证投递；
 *  - 显式 statePhase（可写 MapPhase）可覆盖自动推导（用于纯状态迁移，如 wait 复位 onDuty）；
 *  - wait/geoassert/connect：仅当显式给出 statePhase/stateAlarm 才做状态迁移。
 * 自检：写入态镜像 stage 与所需 stage 不一致时挂 gateWarn（供报告/UI 提示，不阻塞流程）。
 * @returns {{entry: (object|null), warn: (string|null)}}
 */
function preGateState(def0, report, incidentId) {
  // 非业务步：仅显式 statePhase/stateAlarm 时做纯状态迁移
  if (def0.type === 'connect' || def0.type === 'wait' || def0.type === 'geoassert') {
    if (def0.statePhase !== undefined || def0.stateAlarm !== undefined) {
      const phase = def0.statePhase;
      const alarm = def0.stateAlarm !== undefined ? def0.stateAlarm : (phase ? null : undefined);
      return { entry: recordState(report, phase, def0.mode, alarm, incidentId), warn: null };
    }
    return { entry: null, warn: null };
  }
  // 业务步：门禁恒取该步 kind 所需 stage（KIND_STAGE 自动推导），保证消息不被前端丢弃。
  // 刻意不做 statePhase 覆盖：若把 onDuty 等「复位态」前置到业务步，会使其 kind 所需门禁失配而丢消息；
  // 复位态应由紧随其后的 wait 步承担（wait 步支持显式 statePhase 迁移）。
  let stage;
  if (def0.type === 'push') stage = KIND_STAGE[def0.kind];
  else if (def0.type === 'flow') stage = 'dispatch'; // incident
  else stage = 'dispatchTrack'; // seq / car
  const w = stageToWritable(stage);
  const entry = recordState(report, w.phase, def0.mode, w.alarm, incidentId);
  const cur = entry || report.stateLog[report.stateLog.length - 1] || {};
  let warn = null;
  if (stage && cur._stage !== stage) {
    warn = `门禁自检：本步需 stage=${stage}，写入态(phase=${cur.phase ?? '∅'}, currentAlarm=${cur.alarm ?? '∅'}) 镜像=${cur._stage ?? 'null'}，该步消息将被前端丢弃`;
  }
  return { entry, warn };
}

async function runScenario(def, opts, control) {
  const explicitTargets = !!opts.targets;
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
    // 展示模式状态日志：test-ui 轮询时增量写 seat-shared-state（驱动前端模式门禁）
    stateLog: [],
  };
  runs.set(runId, report);

  // connect 自动改绑：未显式指定目标且默认目标不在线时，改绑首个在线客户端（真实前端登录）
  if (!explicitTargets) {
    const rebind = await autoRebindTargets(control, targets);
    if (rebind) {
      targets.userId = rebind.userId;
      targets.sessionState = rebind.sessionState;
      report.targets = targets;
      report.rebound = rebind.note;
      console.log(`[test-runner] ${rebind.note}`);
    }
  }

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
    // 门禁前置：业务步推送「前」先同步展示模式状态（引擎写 stateLog，test-ui 轮询落 localStorage，
    // 消息到达时门禁已就绪）。statePhase/stateAlarm 缺省时由 kind 自动推导（KIND_STAGE → stageToWritable）。
    const gate = preGateState(def0, report, ids.incidentId);
    if (gate.entry) step.state = gate.entry;
    if (gate.warn) step.gateWarn = gate.warn;
    try {
      if (def0.type === 'connect') {
        const r = await checkConnected(def0, control, targets);
        step.status = r.status;
        step.detail = r.detail;
      } else if (def0.type === 'push') {
        const r = await pushOne(control, targets, def0.kind, { ...def0.options, incidentId: ids.incidentId, callId: ids.callId });
        step.status = r.status;
        step.detail = r.detail;
        if (r.status === 'PASS') {
          // 地图交互观察窗：让前端逐帧消化本次推送（定位上图/画像刷新等）
          if (def0.afterMs) await sleep(def0.afterMs);
        }
      } else if (def0.type === 'flow') {
        // 警情状态顺序流转（incidentStates 全集子序列）；态间 holdMs 真实等待
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
          step.detail = `状态流转 ${states.join(' → ')}（${states.length} 次推送，态间 ${def0.holdMs ?? 500}ms）`;
          if (def0.afterMs) await sleep(def0.afterMs);
        }
      } else if (def0.type === 'seq') {
        // 车辆轨迹序列（复用 protocols.carPoints 真实路径）；点间 intervalMs 真实等待，地图逐点可见
        const count = def0.count ?? 10;
        const intervalMs = def0.intervalMs ?? 500;
        let failed = 0;
        for (let i = 0; i < count; i++) {
          const r = await pushOne(control, targets, 'car', {
            ...def0.options,
            routeIndex: def0.routeIndex ?? 0,
            pointIndex: i,
            interval: intervalMs,
            time: new Date(Date.parse(ids.baseTime) + i * intervalMs).toISOString(),
          });
          if (r.status === 'FAIL') failed++;
          if (r.status === 'FAIL' && !targets.userId) { step.status = 'FAIL'; step.detail = `点 ${i + 1}/${count}：${r.detail}`; break; }
          if (i < count - 1) await sleep(intervalMs); // 末点不补等待
        }
        if (failed === 0) {
          step.status = 'PASS';
          step.detail = `轨迹 ${count} 点推送完成（路径 ${def0.routeIndex ?? 0}，点间 ${intervalMs}ms）`;
          if (def0.afterMs) await sleep(def0.afterMs);
        } else if (step.status !== 'FAIL') {
          step.status = 'FAIL';
          step.detail = `${failed}/${count} 点投递失败`;
        }
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
  // 附展示模式轨迹摘要（phase/mode + 门禁镜像 stage，供报告读者了解门禁切换序列）
  report.stateSequence = report.stateLog
    .map(e => [e.phase, e.mode, e._stage ? `gate=${e._stage}` : null].filter(Boolean).join('/'))
    .filter(Boolean)
    .join(' → ');

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
