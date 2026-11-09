'use strict';
// 一键测试台前端逻辑（与 mock-ws 同端口 :18080）
const $ = id => document.getElementById(id);
let currentRunId = null;
let pollTimer = null;
let appliedStateCount = 0; // 本 run 已应用的 stateLog 条数（增量写 localStorage）

// ---- ① GIS 连接：同源登录态注入（复刻 __test/ 控制台 writeState，无需跳转）----
const DEFAULT_USER = 'gis-test-user';
const DEFAULT_SESSION = 'gis-test-session';
const b64url = obj => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const makeMockJwt = (userId, sessionState) =>
  [b64url({ alg: 'none', typ: 'JWT' }), b64url({ sub: userId, session_state: sessionState }), 's'].join('.');

function resolvedTarget() {
  return {
    userId: $('userId').value.trim() || DEFAULT_USER,
    sessionState: $('sessionState').value.trim() || DEFAULT_SESSION,
  };
}

function writeLoginState() {
  const { userId, sessionState } = resolvedTarget();
  const now = Date.now();
  // 与 useUserStore 解析链对齐：sharedMessageSessionFromSnapshot 要求 v=1 + updatedAt 有限 + auth.sessionId / user.userId 非空
  const state = {
    v: 1,
    updatedAt: now,
    auth: { Tenantid: '', 'X-Trace-Id': '', accessToken: makeMockJwt(userId, sessionState), sessionId: sessionState },
    user: { userId, username: 'gis-test', displayName: 'GIS 测试', employeeNo: 'test', roles: [] },
    seat: { seatNumber: '3003', terminalId: 'terminal-02' },
    phase: 'onDuty',
    currentAlarm: null,
  };
  localStorage.setItem('seat-shared-state', JSON.stringify(state));
  $('connStatus').textContent = `已写入登录态（${userId}/${sessionState}，mock JWT）；1~2s 后「在线客户端」应出现该连接`;
  loadClients();
}

function openGis() {
  // 相对路径 = 本 origin（:18080 代理到 vite），与登录态严格同源，避免 localhost/127.0.0.1 跨源
  window.open('/#/map', 'ids-gis-test-map');
}

/**
 * 场景执行中的模式门禁同步：把 report.stateLog 增量写入 seat-shared-state（phase / mode / currentAlarm），
 * GIS 页（同 origin 其他 tab）经 storage 事件 → useUserStore.applySharedState 热更新，
 * 驱动 useLayersStore + messageStagePolicy 门禁随流程切换。仅合并 stateLog 携带的字段，保留登录态。
 *  - alarm：具体 incidentId（写入 currentAlarm={incidentId}）/ null（清空 currentAlarm）/ 省略（不动）。
 *  - 门禁镜像：前端 stage 由 phase+currentAlarm 推导，故 currentAlarm 必须与 phase 同步落盘。
 */
function applyReportState(report) {
  const log = report.stateLog || [];
  if (log.length <= appliedStateCount) return;
  for (let i = appliedStateCount; i < log.length; i++) {
    const entry = log[i];
    try {
      const raw = localStorage.getItem('seat-shared-state');
      const cur = raw ? JSON.parse(raw) : null;
      if (!cur || cur.v !== 1) continue; // 登录态未写入 / 非法，跳过
      if (entry.phase !== undefined) cur.phase = entry.phase;
      if (entry.mode !== undefined) cur.mode = entry.mode;
      if (entry.alarm !== undefined) {
        cur.currentAlarm = entry.alarm ? { incidentId: entry.alarm } : null;
      }
      cur.updatedAt = Date.now();
      localStorage.setItem('seat-shared-state', JSON.stringify(cur));
    } catch { /* 格式非法不阻塞流程 */ }
  }
  appliedStateCount = log.length;
  const el = $('stateIndicator');
  if (el && log.length) {
    const last = log[log.length - 1];
    const alarmTxt = last.alarm ? ` / alarm=${last.alarm}` : '';
    const stageTxt = last._stage ? ` / gate=${last._stage}` : '';
    el.textContent = `模式同步 ${appliedStateCount}/${log.length} 条 → phase=${last.phase || '—'}${last.mode ? ' / mode=' + last.mode : ''}${alarmTxt}${stageTxt}`;
  }
}

function oneClickConnect() {
  writeLoginState();
  openGis();
}

async function loadClients() {
  try {
    const res = await fetch('/api/test/clients');
    const { clients } = await res.json();
    const el = $('clientList');
    if (!clients.length) {
      el.innerHTML = '<span class="none">无在线客户端 — 点「⚡ 一键连接 GIS」写入登录态并打开地图页</span>';
      return;
    }
    el.innerHTML = clients.map(c =>
      `<span class="chip" title="${c.connId || ''}">${c.userId} <span class="state">/${c.sessionState}</span><span class="state">${(c.subscriptions || []).length} subs</span></span>`
    ).join('');
  } catch { /* 网络抖动，下次轮询自愈 */ }
}

async function loadModes() {
  const res = await fetch('/api/test/modes');
  const { modes } = await res.json();
  const sel = $('mode');
  sel.innerHTML = modes.map(m =>
    `<option value="${m.key}" ${m.broken ? 'disabled' : ''}>${m.label}${m.broken ? '（加载失败）' : ''}</option>`
  ).join('');
  if (!modes.length) sel.innerHTML = '<option value="">无可用模式</option>';
}

async function loadHistory() {
  const res = await fetch('/api/test/runs');
  const { runs } = await res.json();
  $('history').innerHTML = runs.length ? runs.map(r => `
    <li class="st-${r.summary?.startsWith?.('全部通过') ? 'PASS' : 'FAIL'}">
      <span class="badge">${r.label}</span>
      <span style="font-size:11px;color:var(--dim)">${new Date(r.startedAt).toLocaleTimeString()}</span>
      <div class="detail">${r.summary}</div>
    </li>`).join('') : '<li style="opacity:.5">暂无运行记录</li>';
}

function renderSteps(steps) {
  $('steps').innerHTML = steps.map(s => `
    <li class="st-${s.status}">
      <span class="badge">${s.status}</span> ${s.name}
      ${s.ms != null ? `<span style="font-size:11px;color:var(--dim)">${s.ms}ms</span>` : ''}
      <div class="detail">${s.detail}</div>
    </li>`).join('');
}

function showSummary(summary) {
  const ok = !summary || summary.startsWith('全部通过');
  const el = $('summary');
  el.textContent = summary;
  el.className = `summary ${ok ? 'ok' : 'bad'}`;
}

async function runScenario() {
  const mode = $('mode').value;
  if (!mode) return;
  const body = {
    mode,
    full: $('full').checked,
  };
  const uid = $('userId').value.trim();
  const ssid = $('sessionState').value.trim();
  if (uid || ssid) body.targets = { userId: uid || undefined, sessionState: ssid || undefined };

  $('run').disabled = true;
  $('stop').disabled = false;
  $('status').textContent = '执行中…';
  $('resultPanel').hidden = false;
  $('summary').textContent = '…';
  $('summary').className = 'summary';
  $('steps').innerHTML = '';

  const res = await fetch('/api/test/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    $('status').textContent = `启动失败：${err.error || res.status}`;
    $('run').disabled = false;
    $('stop').disabled = true;
    return;
  }
  const { runId } = await res.json();
  currentRunId = runId;
  appliedStateCount = 0; // 新 run 重置增量指针

  // 轮询进度
  const poll = async () => {
    if (!currentRunId) return;
    try {
      const r = await fetch(`/api/test/runs/${currentRunId}`);
      const report = await r.json();
      renderSteps(report.steps);
      applyReportState(report);
      if (report.finishedAt) {
        showSummary(report.summary);
        $('status').textContent = '完成';
        $('run').disabled = false;
        $('stop').disabled = true;
        currentRunId = null;
        loadHistory();
        return;
      }
      $('status').textContent = `执行中（第 ${report.steps.filter(s => s.status !== 'PENDING').length}/${report.steps.length} 步）`;
      // 250ms 远小于引擎观察窗/点间隔（afterMs/intervalMs ≥ 300ms）：门禁先于下一消息落盘
      pollTimer = setTimeout(poll, 250);
    } catch { /* network blip，继续轮询 */ pollTimer = setTimeout(poll, 800); }
  };
  poll();
}

function stopRun() {
  // 中止 = 停止轮询（场景已在 server 侧运行，不支持中断；UI 层面取消跟踪）
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
  currentRunId = null;
  $('status').textContent = '已取消跟踪';
  $('run').disabled = false;
  $('stop').disabled = true;
}

document.addEventListener('DOMContentLoaded', () => {
  $('run').addEventListener('click', runScenario);
  $('stop').addEventListener('click', stopRun);
  $('refresh').addEventListener('click', loadHistory);
  $('oneClick').addEventListener('click', oneClickConnect);
  $('writeLogin').addEventListener('click', writeLoginState);
  $('openGis').addEventListener('click', openGis);
  loadModes();
  loadHistory();
  loadClients();
  setInterval(loadClients, 2500);
});
