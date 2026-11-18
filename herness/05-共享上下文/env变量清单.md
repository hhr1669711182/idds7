# VITE_* 环境变量清单

> 单一真相源。每次新增或重命名 `VITE_*` 变量时，必须同步更新本文件与各 `.env.*` 文件。
> 对照表基于 2026-11-13 整理；如有遗漏请在对应列补充并更新本文件。

## 对照矩阵

| 变量名 | .env.development | .env.test | .env.production | .env.local.example | appEnv 字段 |
|--------|:--:|:--:|:--:|:--:|------------|
| VITE_APP_ENV | ✅ | ✅ | ✅ | ❌（由环境决定） | appEnv.appMode |
| VITE_API_BASE_URL | ✅ | ✅ | ✅ | ✅ | appEnv.apiBaseUrl |
| VITE_DISPATCH_MOCK | ✅ | ❌ | ❌ | ✅（注释格式：模板独有） | —（vite.config.ts 直接读） |
| VITE_WS_URL | ✅ | ✅ | ✅ | ✅ | appEnv.wsUrl |
| VITE_MESSAGE_SERVICE_ORIGIN | ✅ | ✅ | ✅ | ✅ | appEnv.messageServiceOrigin |
| VITE_MESSAGE_CLIENT | ✅ | ✅ | ✅ | ✅ | appEnv.messageClient |
| VITE_MESSAGE_SEAT_KEY | ✅ | ❌ | ✅ | ✅ | — |
| VITE_USE_WS | ✅ | ✅ | ✅ | ✅（模板独有：联调用 true） | appEnv.useWS |
| VITE_USE_POSTMESSAGE | ✅ | ✅ | ✅ | ✅（模板独有：默认 false） | appEnv.usePostMessage |
| VITE_USE_BROADCAST_CHANNEL | ✅ | ✅ | ✅ | ✅ | appEnv.useBroadcastChannel |
| VITE_RELAY_CHANNEL_NAME | ✅ | ✅ | ✅ | ✅ | appEnv.relayChannelName |
| VITE_ROUTE_API_URL | ✅ | ❌（注释） | ✅ | ✅ | — |
| VITE_GEOSERVER_URL | ✅ | ✅ | ✅ | ✅ | appEnv.geoserverBaseUrl |
| VITE_GEOSERVER_WMS_URL | ❌ | ❌ | ❌ | ✅（模板独有） | appEnv.geoserverWmsUrl |
| VITE_MAP_PROXY_API | ✅ | ✅ | ✅ | ✅ | appEnv.mapApiBaseUrl |
| VITE_PERSIST_SECRET_KEY | ✅ | ✅ | ✅ | ✅ | — |
| VITE_ENABLE_DYNAMIC_ROUTES | ✅ | ✅ | ✅ | ✅ | — |
| VITE_USE_MOCK | ✅ | ✅ | ✅ | ✅ | appEnv.useMock |
| VITE_USE_ONLINE_ICON | ✅ | ✅ | ✅ | ✅ | — |
| VITE_PANEL_25D_URL | ✅ | ✅ | ✅ | ✅ | appEnv.panel25DUrl |
| VITE_PANEL_3D_URL | ✅ | ✅ | ✅ | ✅ | appEnv.panel3DUrl |
| VITE_MAP_CENTER | ✅ | ✅ | ✅ | ✅ | appEnv.mapCenter |
| VITE_MAP_ADMCODE | ✅ | ✅ | ✅ | ✅ | appEnv.mapAdcode |
| VITE_MAP_CITY | ✅ | ✅ | ✅ | ✅（注释格式） | appEnv.mapCity |
| VITE_MAP_KEYWORDS | ❌ | ❌ | ❌ | ✅（注释格式，预留扩展） | appEnv.mapKeywords |
| VITE_WEATHER_SOURCE | ❌ | ❌ | ❌ | ✅ | appEnv.weatherSource |
| VITE_LOG_LEVEL | ❌ | ❌ | ❌ | ✅（模板独有） | — |
| VITE_ROUTE_CONTINUITY_ENABLED | ✅ | ✅ | ✅ | ✅ | appEnv.routeContinuityEnabled |
| VITE_MAP_KEYWORDS | ❌ | ❌ | ❌ | ❌ | appEnv.mapKeywords |

## 说明

- **✅**：已配置（值为具体值、空值或注释形式均可）
- **❌**：该文件中未出现此变量
- **模板独有**：`.env.local.example` 中专为本地开发联调添加的变量，正式三环境不强制
- **appEnv 字段**：`src/config/env.ts` 中对应的读取字段；如为 `—` 表示不由 appEnv 读取

## 维护规则

1. 新增 `VITE_*` 时，在本表添加行，并在四个 `.env.*` 文件中同步添加
2. 重命名变量时（如 `VITE_AMAP_*` → `VITE_MAP_*`），同步更新本表所有引用
3. `.env.local.example` 中的条目统一用注释格式：`# VITE_FOO=  # 用途说明`
4. 如有变量废弃，在行内标注「已废弃」并保留旧名作为历史记录
5. 新增 `VITE_*` 后运行 `node scripts/check-env-sync.mjs --fix` 自动补齐模板缺失键（已内置于 `pnpm harness:check`）
