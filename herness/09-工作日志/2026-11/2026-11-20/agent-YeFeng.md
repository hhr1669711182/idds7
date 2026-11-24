# 2026-11-20 · YeFeng 工作日志

## 任务：新增「主屏 × 地图屏交互测试文档」

- 背景：参照 `docs/历史轨迹回放测试文档.md` 风格，在测试环境（非本地 mock）下验证主屏（ids-seat-web）→ 地图屏（ids-gis-web）交互链路。
- 产出：`docs/主屏与地图屏交互测试文档.md`（新建，仅此一个文件）。
- 用例主线（10 个）：登录连接 → 来电接听 → 定位上图 → 二次定位 → 接警立案 → 切换主管队站 → 调派派车 → 车辆 GPS 跟踪 → 终态历史轨迹（引用既有轨迹文档）→ 回归值守。
- 关键事实依据（只读核实）：
  - 交互通道：WS 4 个订阅 topic（`docs/source/07-协议事件清单.md` §0.3）+ BC `ids-map-screen-relay` 选点（`src/composables/useGisPointSelection.ts`，Console 关键字 `[gis-point-channel]`）+ 共享态 `seat-shared-state` 决定 stage 门禁（`utils/seatSharedState.ts`）。
  - 切换主管队站：`DISASTER_PROFILE/UPDATED` → `useIncidentLocationStore.ts` 判定 `primaryStationChanged`，强制以消息 `m_org_id` 覆盖坐标命中辖区，重建主管站/辖区/资源/路径线。
  - 测试环境 WS：`.env.test` = `ws://ids-test.ks.telewave.tech/message-client/ws`，`VITE_USE_MOCK=false`。
- 过程修正：初版误拆成「地图屏文档 + 主屏文档」两份，经用户澄清合并为一份交互文档；TC 顺序按用户要求调整（二次定位插在 TC-03 与 TC-04 之间；删除到场/展开/归队用例；新增切换主管队站）。
- 未改代码、未改契约；纯文档新增。
- 补充修正：地图屏实际地址为 `http://ids-test.ks.telewave.tech/gis-web/#/map`（用户提供），已更新文档中 3 处地址引用（环境表、启动步骤、TC-01）。
- 环境修正：三端同源 `ids-test.ks.telewave.tech`：主屏 `.../seat-web/acceptance/main-shell`、副屏 `.../aux-shell`、地图屏 `.../gis-web/#/map`。撤掉此前误判的跨源限制说明（BC/localStorage 均正常工作）。
- 新增用例 TC-05B「副屏切换警情上图」：前提是目标警情必须有位置，否则不上图；异常兜底表与核验速查表同步补行。
