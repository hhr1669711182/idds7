# 2026-11-23 agent-YeFeng

## BFF mock 多环境 + 局部模拟开关

**需求**：历史轨迹回放假数据需 dev/test/uat 各造一份；支持局部模拟（可逐组选择 mock 或透传真实后端）。

**改动（仅 server/ 测试工具层，不碰 src/）**：

- 新增 `server/mock-data/`：三套环境基准数据
  - `test.js` 北京（沿用 protocols.carPoints）、`uat.js` 北京（队站/地址加 UAT- 前缀区分）、`dev.js` 深圳（北京路线整体偏移到深圳中心）
  - `index.js` 加载器 `getMockData(env)`，未知 env 回退 test
- 改 `server/mock-ws.js`：
  - 新增状态 `bffMockEnv`（dev/test/uat）+ `bffMockGroups`（4 组逐组开关）
  - `handleBffMock` 每个分支前判断组开关，OFF 则 `return false` 透传 `proxyHttp` → 真实后端；数据从 `getMockData(bffMockEnv)` 取
  - 新增 HTTP 接口 `GET/POST /__test/api/mock-config`（合并 env/dataset/groups）；保留旧 `/__test/api/mock-dataset` 兼容
  - `globalThis.__idsMockControl` 暴露 `set/getBffMockEnv`、`set/getBffMockGroups`
- 改 `server/test-ui/{index.html,app.js}`：控制面板新增「环境」下拉 + 「局部模拟」4 复选框（警情画像/警情详情/出动车辆/历史轨迹）+ 全选/全不选；数据集下拉保留

**mock 分组（逐组 ON=mock / OFF=透传）**：`profile` 警情画像、`detail` 警情详情、`turnoutVehicles` 出动车辆、`carTrack` 历史轨迹。三者正交：env 决定城市坐标、dataset 决定数据形态（withTrack/noTrack/...）、groups 决定是否 mock。

**验证**（临时端口 18099，已关停）：
- dev car-track 首点 (113.92, 22.59) 落深圳 ✓；test/uat 落北京 ✓
- dev turnout 队站「深圳市南山区大冲消防救援站」+ 粤B 车牌；uat 带 UAT- 前缀 ✓
- 关 carTrack 组 → car-track 不再返回 mock 信封（透传，500/401 来自真实链路）✓
- 关 profile 组同理透传 ✓；detail 组开着时正常 mock 且 uat 前缀生效 ✓
- `node --check` 全部通过；registry 加载 8 场景无 broken ✓

**使用**：需重启 `pnpm dev:local:test` 让服务端改动生效；从 test-ui(:18080) 打开 GIS。`MOCK_ENV` 环境变量可预设默认环境。

## 修复：历史轨迹 mock 不生效（请求路径 /api 前缀失配）

**现象**：局部模拟 4 组全勾选，地图屏仍提示"无历史轨迹数据"。

**根因**：`.env.local` 中 `VITE_API_BASE_URL=/api`，前端 alova 给所有请求加 `/api` 前缀，实际请求 `/api/car-track-api/api/car/track/query`；而 mock-ws 拦截规则只匹配不带前缀的 `/car-track-api/...`，全部失配 → 透传 Vite 代理 → 真实后端无数据。与勾选无关，请求根本没进 mock 分支。

**定位方法**（curl 对照实证）：
- `POST :18080/car-track-api/...`（无前缀）→ 命中 mock，31 点
- `POST :18080/api/car-track-api/...`（带前缀）→ 404，未命中 mock

**修复**（`server/mock-ws.js`）：`handleBffMock` 入口归一化路径 `mockPath = pathname.replace(/^\/api(?=\/|$)/, '')`，4 处匹配（profile/detail/turnout/car-track）改用 `mockPath`。未命中时仍用原始 `pathname` 走 proxy（Vite 代理 /api 会自行 rewrite 去前缀），互不影响。

**验证**（临时端口 18099）：带 `/api` 前缀 + 全开 → 命中 mock（car-track 31 点 / turnout 2 车）✓；关 carTrack 组后带前缀请求正确透传 ✓。

**使用提醒**：修复后仍需重启 `pnpm dev:local:test`；且 GIS 必须从 test-ui(:18080) 的「打开 GIS」按钮进入，不能直接开 :8888（否则请求走 Vite 代理，根本不到 mock-ws）。

## 修复：历史轨迹回放面板「路线」下拉闭合时回显 stationId 而非队站名

**现象**：下拉展开时选项显示队站名（正确），但闭合后回显长 ID（stationId）。

**根因**：`VehicleTrackPanel.vue` 的 `el-option` 只设了 `:value`，靠默认插槽渲染展开内容，未设 `:label`。Element Plus `el-select` 闭合回显取选中 option 的 `label`，缺失则回显原始 `value`（= stationId）。

**修复**：给 `el-option` 补 `:label="group.stationName ?? group.stationId ?? '未知路线'"`。闭合回显队站名，展开样式不变。`GetDiagnostics` 0 报错。
