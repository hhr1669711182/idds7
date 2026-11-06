'use strict';
// 挂载层：把一键测试台（/test-ui/ 静态页）与测试 API（/api/test/*）挂到 mock-ws.js 的 HTTP server。
// 进程内控制端直连 clients Map（与 mock-ws.js 推送分支同一套语义，不另开 WS）。
const fs = require('node:fs');
const path = require('node:path');
const { createInProcessControl, runScenario, getRun, listRuns } = require('./test-runner');
const { loadModes, getScenario } = require('./test-runner/registry');

const TEST_UI_DIR = path.join(__dirname, 'test-ui');

function readJsonBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limitBytes) { reject(new Error('body too large')); req.destroy(); return; }
    });
    req.on('end', () => {
      if (!data) return resolve(null);
      try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function handleStatic(res, pathname) {
  // /test-ui/ → index.html；/test-ui/app.js → app.js
  const rel = pathname === '/test-ui/' ? 'index.html' : pathname.slice('/test-ui/'.length);
  const safe = path.normalize(rel).replace(/^([.][.][/\\]|[/\\][.][.])/, '');
  const file = path.join(TEST_UI_DIR, safe === '.' ? 'index.html' : safe);
  if (!file.startsWith(TEST_UI_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
  const type = file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

/**
 * @returns {boolean} true = 已处理（测试台静态页或 /api/test/*），false = 交回原 proxy
 */
function mountTestHarness(req, res, { clients }) {
  const pathname = new URL(req.url, 'http://localhost').pathname;

  if (pathname === '/test-ui') { res.writeHead(302, { Location: '/test-ui/' }); return res.end(); }
  if (pathname === '/test-ui/' || pathname.startsWith('/test-ui/')) {
    handleStatic(res, pathname);
    return true;
  }

  if (!pathname.startsWith('/api/test')) return false;
  const control = createInProcessControl({ clients });
  const method = req.method;

  if (method === 'GET' && pathname === '/api/test/modes') {
    sendJson(res, 200, { modes: loadModes() });
    return true;
  }

  if (method === 'GET' && pathname === '/api/test/runs') {
    sendJson(res, 200, { runs: listRuns() });
    return true;
  }

  const runMatch = pathname.match(/^\/api\/test\/runs\/([\w-]+)$/);
  if (method === 'GET' && runMatch) {
    const report = getRun(runMatch[1]);
    if (!report) { sendJson(res, 404, { error: 'run not found' }); return true; }
    sendJson(res, 200, report);
    return true;
  }

  if (method === 'POST' && pathname === '/api/test/run') {
    readJsonBody(req).then(body => {
      const def = getScenario(body?.mode || 'dispatch');
      if (!def) { sendJson(res, 404, { error: `unknown mode: ${body?.mode}` }); return; }
      // 非阻塞：立即返回 runId，UI 轮询 /api/test/runs/:id 取进度
      const runId = require('node:crypto').randomUUID();
      void runScenario(def, { runId, full: !!body?.full, targets: body?.targets || undefined }, control);
      sendJson(res, 202, { runId, mode: def.key, full: !!body?.full });
    }).catch(error => sendJson(res, 400, { error: error.message }));
    return true;
  }

  sendJson(res, 404, { error: `unhandled: ${method} ${pathname}` });
  return true;
}

module.exports = { mountTestHarness };
