/**
 * 消息发送出口 —— 业务侧向外发送消息的统一入口。
 *
 * 定位：
 * - 按 `MESSAGE_SYSTEM` 分类，本文件只做 barrel 再导出；
 * - 业务代码通过本模块发送，不再从 controller 层拿「控制对象」；
 * - 每个分类文件只做「事件键 + 通道 + 载荷」的薄封装，不持有业务状态。
 *
 * 分类文件与 system 对应：
 * - `map.ts`      system=map      （route/map/aoi/layer/dispatch 键中 system=map 的）
 * - `host.ts`     system=host     （与宿主页面的 postMessage 通道）
 * - `three.ts`    system=three
 * - `dispatch.ts` system=dispatch（预留，当前无实现）
 * - `common.ts`   跨 system 通用（预留：hello / heartbeat / error）
 *
 * 硬约束（完整规范见 herness/05-共享上下文/消息协议速查.md「publish 发送规范」）：
 * - 只允许 useMessageStore().publish，禁止裸 WebSocket / 裸 postMessage；
 * - 事件键必须来自 MESSAGE_EVENT_KEY，禁止字符串字面量；
 * - system / channel 在分类文件内固定，不暴露给调用方；
 * - 本模块不做业务判断、不持状态、不注册到任何控制器；
 * - 新增分类文件必须同时在本文件加一行 export，并回写 herness 文档。
 */

export * from './map.ts'
export * from './host.ts'
export * from './three.ts'