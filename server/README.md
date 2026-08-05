# Mock WebSocket Server

启动：

```bash
npm run mock:server
```

重启并清理旧进程：

```bash
npm run mock:server:restart
```

只清理旧进程：

```bash
npm run mock:server:stop
```

默认监听：

- WebSocket: `ws://本机IPv4:8787/`
- 前端开发环境使用：`ws://192.168.173.94:8787/`

可选环境变量：

配置文件只读取 `server/.env`，不会读取前端工程的 `.env.development`。

示例：

```ini
MOCK_WS_PORT=8787
MOCK_WS_PUSH_INTERVAL_MS=60000
MOCK_WS_FIRST_PUSH_DELAY_MS=2000
MOCK_WS_INCOMING_CALL_DELAY_MS=1200
```

- `MOCK_WS_HOST`：监听地址，默认自动选择本机 IPv4
- `MOCK_WS_PORT`：监听端口，默认 `8787`
- `MOCK_WS_PUSH_INTERVAL_MS`：定时推送间隔，默认 `60000`
- `MOCK_WS_FIRST_PUSH_DELAY_MS`：首次连接后的第一次数据推送延迟，默认 `2000`
- `MOCK_WS_INCOMING_CALL_DELAY_MS`：首次数据推送后的来电提示延迟，默认 `1200`

HTTP API：

- `GET /api/health`
- `GET /api/routes`
- `GET /api/route-plan-request`
- `POST /api/broadcast-route-plan`
- `POST /api/broadcast-incoming-call`

WebSocket 客户端连接成功 2 秒后收到第一次 `route.plan.request`，之后按定时器持续推送。

服务正常退出时会关闭 HTTP listener、WebSocket clients 和定时推送任务。开发时如果 `8787` 被旧 mock server 占用，优先使用 `npm run mock:server:restart`。
