// v2 层级 topic（integration-guide-v2.md §3.1）：分隔符 /，段 [A-Za-z0-9_-]{1,64}，
// 通配 + 单层、# 多层（只能出现在末尾）。pattern 来自订阅集合，topic 来自消息。
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
function topicMatches(pattern, topic) {
  if (pattern === topic) return true;
  const ps = String(pattern).split('/');
  const ts = String(topic).split('/');
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    if (p === '#') return i === ps.length - 1 && ts.length > i;
    if (i >= ts.length) return false;
    if (p === '+') continue;
    if (p !== ts[i]) return false;
  }
  return ps.length === ts.length;
}
const wrappers = ['request', 'data', 'body', 'message', 'payload', 'userMsgBodyList'];
// Match documented envelope layers. Each body is filtered independently, avoiding
// accidental delivery of unrelated topics when multiple bodies share one frame.
// v2 消息的 topics 为相对 clientId 的 topic 字符串数组（§5），订阅为 topic 模式集合。
function filterFrame(value, subscriptions) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const items = value.map(item => filterFrame(item, subscriptions)).filter(item => item !== null);
    return items.length ? items : null;
  }
  if (Array.isArray(value.topics) && value.topics.length
    && !value.topics.some(t => typeof t === 'string' && [...subscriptions].some(p => topicMatches(p, t)))) return null;
  const result = { ...value };
  for (const key of wrappers) {
    if (!value[key] || typeof value[key] !== 'object') continue;
    const child = filterFrame(value[key], subscriptions);
    if (child === null) return null;
    result[key] = child;
  }
  return result;
}
module.exports = { topicMatches, filterFrame };
