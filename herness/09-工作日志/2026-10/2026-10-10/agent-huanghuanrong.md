# 工作日志 2026-10-10

> 本文是 `2026-10-10` 当天的**一次性流水账**，写完不再修改。
> 有长期价值的结论沉淀到 `herness/05-共享上下文/当前状态摘要.md`。

| 日期 | 内容 | 涉及文件 | 关联文档 | 备注 |
|------|------|----------|----------|------|
| 2026-10-10 | 新增 useBroadcastChannel：参照 useWebSocket 的 WebSocketClient 结构实现 BroadcastChannelClient（构造即连接/send/sendEvent/disconnect/回调，无重连心跳、不自回发）；useMessageStore 增加 bindBroadcastChannel + bcClients + publish 分支 + disconnectSystem 清理；MESSAGE_CHANNEL 增加 broadcastChannel；register/initMessage 以 VITE_USE_BROADCAST_CHANNEL 开关同 bindParent 方式注册，并修复 dispose 未执行 cleanups 的泄漏 | src/hooks/useBroadcastChannel.ts、src/store/useMessageStore.ts、src/register/initMessage.ts、src/const/const.message.type.ts、src/config/env.ts、.env.*、herness/05-共享上下文/消息协议速查.md | — |
| 2026-10-10 | MarkDraw 第3轮：新增「清除元素」按钮（engine.clearFeatures + 数据源监听同步可用态）、量算/查询工具改为 MarkDraw 内部实现（tools/MeasureTools + tools/QueryTools）、修复量算图元无 id 导致清除漏删、视图面板三级改上下两段自适应排版、缩放控件下移至左下角、清理 sharedMapTools.ts 死码 | src/components/MarkDraw/**、src/views/markDraw/index.vue | — |
| 2026-10-10 | MarkDraw 第4轮：移除圈选查询 / 实时人口工具（含 QueryTools 内两工具、queryState 相关类型与事件、结果条查询分支），工具数 17→15；修复确认框溢出——改为 createApp 动态挂载 MdModal + Teleport to body，.md-modal* / .md-message* 样式从组件 scoped 提到全局 styles/toast.less，z-index 100001；要素列表列名改为跟随 WFS 返回的 properties（排除几何与空值列，常见业务字段优先，最多 5 列），加载失败时清空避免残留上个图层数据 | src/components/MarkDraw/** | — |
| 2026-10-10 | 产出《项目文件夹架构设计说明》：按 src/** 实测梳理五段式依赖流向、逐层目录职责（views/components、store、controller、baseComponent 与 plugins/mapPlugins、hooks/interceptor/register、service/apis、config/const、composables、router/layout、types/shims、styles/assets、utils/directives、lib 双形态）、横切约定（消息协议改一处改三处、订阅解耦、只经 appEnv、WGS84、lint 基线）、落位速查表、决策记录与 6 项已知架构债 | herness/02-技术设计/前端/项目文件夹架构设计说明.md、herness/02-技术设计/前端/_index.md | — |
| 2026-10-10 | MarkDraw 第5轮：修复选中图层后图层列表清空——setActiveLayer 用 id.split(':')[0] 推分组（gis）但真实 groupId 是 dispatch，导致分组失配；改为不推导并加 safeGroupId 兜底；新增 utils/layerStyle.ts 按几何类型+图层语义上图（围栏虚线 / 有 icon 用图标化点位 / 无 icon 用默认样式），接入 engine.addFeature 与 importGeoJSON；修复 geometryToLngLat 只处理两层嵌套导致 MultiPolygon 全变 null，改为递归并新增 CoordArray 类型 | src/components/MarkDraw/** | — |
