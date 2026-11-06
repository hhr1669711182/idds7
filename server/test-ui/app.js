'use strict';
// 一键测试台前端逻辑（与 mock-ws 同端口 :18080）
const $ = id => document.getElementById(id);
let currentRunId = null;
let pollTimer = null;

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

  // 轮询进度
  const poll = async () => {
    if (!currentRunId) return;
    try {
      const r = await fetch(`/api/test/runs/${currentRunId}`);
      const report = await r.json();
      renderSteps(report.steps);
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
      pollTimer = setTimeout(poll, 600);
    } catch { /* network blip，继续轮询 */ pollTimer = setTimeout(poll, 1000); }
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
  loadModes();
  loadHistory();
});
