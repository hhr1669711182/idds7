# 地图与外部业务系统交互事件集（socket + postMessage）

## 1.统一消息协议

### 1.1 标准信封（推荐）

项目内统一采用 `MessageEnvelope` 作为跨系统通信协议：

```ts
// 基础消息结构
type MessageEnvelope<T = any> = {
  // 必传参数
  id: string  // 请求事件ID，方便追踪、应答、排错
  ts: number  // timestamp 发送时间
  system: 'host' | 'map' | 'dispatch'  // 消息来源系统（自定义）
  eventKey: string
  data: T
  
  // 可选参数
  /** 可选，目标系统，指定消息应被哪个系统处理；留空表示广播给所有订阅者 */
  targetSystem?: string
  /** 可选，附加元数据，用于扩展字段，如链路追踪、用户标识等 */
  meta?: Record<string, any>
  /** 可选，消息协议版本，当前固定为 '1.0.0'，用于后续版本兼容 */
  v?: '1.0.0'
  /** 可选，是否移除相同元素，默认 false */
  isRemoveSameElement?: boolean
}
```

## 2.统一入口（推荐使用）

统一收发入口： [useMessageStore.ts](file:///d:/work/telewave/ids/ids-gis-web/src/store/useMessageStore.ts)

它负责：

- socket/postMessage 的接入与归一
- 按 `system` 分类存储 `inbox/outbox/lastBySystem`
- `publish(eventKey, data, options)` 统一下行

### 2.1 初始化示例

```ts
import { useMessageStore } from '@/store/useMessageStore'
import { MESSAGE_SYSTEM, MESSAGE_CHANNEL, MESSAGE_EVENT_KEY } from '@/const/const.message.type'

const msg = useMessageStore()

const unbindHost = msg.bindParent({
  system: MESSAGE_SYSTEM.HOST,
  acceptOrigins: ['https://host.example.com'],
})

const disconnectWs = msg.connectWebSocket({
  system: MESSAGE_SYSTEM.DISPATCH,
  url: import.meta.env.VITE_WS_URL,
  socketOptions: {
    heartbeatMessage: { eventKey: MESSAGE_EVENT_KEY.HEARTBEAT, data: 'ping' },
  },
})
```

### 2.2 发送示例（ws / postMessage）

```ts
msg.publish(MESSAGE_EVENT_KEY.HELLO, { from: 'map' }, {
  system: MESSAGE_SYSTEM.DISPATCH,
  channel: MESSAGE_CHANNEL.WS,
})

msg.publish(MESSAGE_EVENT_KEY.MAP_READY, { ok: true }, {
  system: MESSAGE_SYSTEM.MAP,
  channel: MESSAGE_CHANNEL.POST_MESSAGE,
  targetOrigin: '*',
})
```

## 3.事件常量定义

常量文件：

- [const.message.type.ts](file:///d:/work/telewave/ids/ids-gis-web/src/const/const.message.type.ts)

### 3.1 system（分系统）

| system      | 含义                    |
| ----------- | --------------------- |
| `host`      | 宿主系统（当前系统被嵌入时的上游）     |
| `map`       | 地图主应用                 |
| `dispatch`  | 调度/告警/推送等业务系统（典型走 ws） |
| `panel_25d` | 2.5D iframe 面板系统      |
| `panel_3d`  | 3D iframe 面板系统        |

### 3.2 eventKey（事件键）

| eventKey             | 方向     | data（建议结构）                                               | 说明                             | <br /> |
| -------------------- | ------ | -------------------------------------------------------- | ------------------------------ | :----- |
| `hello`              | 双向     | `{ from, version? }`                                     | 握手                             | <br /> |
| `heartbeat`          | 双向     | `'ping' \| 'pong' \| any`                                | 心跳                             | <br /> |
| `error`              | 双向     | `{ code?, message, detail? }`                            | 错误                             | <br /> |
| `map.ready`          | map→外部 | `{ ok: true }`                                           | 地图初始化完成                        | <br /> |
| `map.view.changed`   | map→外部 | `{ center, zoom, rotation? }`                            | 视图变化                           | <br /> |
| `map.click`          | map→外部 | `{ lngLat, pixel?, featureId? }`                         | 点击事件                           | <br /> |
| `map.pointer.move`   | map→外部 | `{ lngLat, pixel? }`                                     | 鼠标移动（谨慎频率）                     | <br /> |
| `layer.set.visible`  | 外部→map | `{ layerId, visible }`                                   | 控制图层显隐                         | <br /> |
| `layer.set.opacity`  | 外部→map | `{ layerId, opacity }`                                   | 控制透明度                          | <br /> |
| `layer.set.zIndex`   | 外部→map | `{ layerId, zIndex }`                                    | 控制层级                           | <br /> |
| `overlay.open`       | 双向     | `{ id, lngLat?, html?, props? }`                         | 打开弹窗                           | <br /> |
| `overlay.close`      | 双向     | `{ id }`                                                 | 关闭弹窗                           | <br /> |
| `draw.start`         | 外部→map | `{ type, options? }`                                     | 开始绘制                           | <br /> |
| `draw.end`           | map→外部 | `{ type, geometry, featureId? }`                         | 绘制完成                           | <br /> |
| `draw.clear`         | 双向     | \`{ scope?: 'all'                                        | 'draw' }\`                     | 清理绘制   |
| `route.plan.request` | 外部→map | `{ startLngLat, endLngLat, strategy? }`                  | 请求路径规划                         | <br /> |
| `route.plan.result`  | map→外部 | `{ startLngLat, endLngLat, path, distance?, duration? }` | 路径规划结果                         | <br /> |
| `route.plan.clear`   | 双向     | `{}`                                                     | 清除路线                           | <br /> |
| `config.open`        | 外部→map | \`{ tab?: 'feature'                                      | 'layer' }\`                    | 打开配置面板 |
| `config.save`        | map→外部 | `{ featureConfig, layerConfig, updatedAt }`              | 保存配置                           | <br /> |
| `config.cancel`      | map→外部 | `{}`                                                     | 取消配置                           | <br /> |
| `dispatch.update`    | 外部→map | `{ ... }`                                                | 调度更新（legacy: `dispatchUpdate`） | <br /> |
| `alarm.update`       | 外部→map | `{ ... }`                                                | 告警更新（legacy: `alarmUpdate`）    | <br /> |
| <br />               | <br /> | <br />                                                   | <br />                         | <br /> |

## 4.postMessage（iframe）接入方式

低层 hook： [usePostMessage.ts](file:///d:/work/telewave/ids/ids-gis-web/src/hooks/usePostMessage.ts)

### 4.1 子系统向父系统发消息

```ts
import { usePostParentMessage } from '@/hooks/usePostMessage'

const { sendMessage } = usePostParentMessage()
sendMessage({ eventKey: 'hello', data: { from: 'map' } }, '*')
```

### 4.2 父系统向子 iframe 发消息

```ts
import { ref } from 'vue'
import { usePostChildMessage } from '@/hooks/usePostMessage'

const iframeRef = ref<HTMLIFrameElement | null>(null)
const { sendMessage } = usePostChildMessage(() => iframeRef.value)
sendMessage({ eventKey: 'layer.set.visible', data: { layerId: 'x', visible: true } }, '*')
```

## 5.WebSocket 接入方式

底层 ws client： [useWebSocket.ts](file:///d:/work/telewave/ids/ids-gis-web/src/hooks/useWebSocket.ts)

```ts
import { WebSocketClient } from '@/hooks/useWebSocket'

const ws = new WebSocketClient(import.meta.env.VITE_WS_URL, {
  onMessage: (msg) => {
    // msg 可能是 MessageEnvelope，也可能是 legacy/type
  },
})

ws.sendEvent('hello', { from: 'map' })
```

