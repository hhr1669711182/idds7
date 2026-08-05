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
  system: 'host' | 'map' | 'dispatch' // 上游系统（自定义）
  eventKey: string // 事件键（固定值）
  data: T // 事件业务数据
  
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

### 1.2 eventKey（事件键）

| eventKey             | 方向     | data（建议结构）                                               | 说明                             | 其他     |
| -------------------- | ------ | -------------------------------------------------------- | ------------------------------ | :----- |
| `hello`              | 双向     | `{ from, version? }`                                     | 握手                             | <br /> |
| `heartbeat`          | 双向     | `'ping' \| 'pong' \| any`                                | 心跳                             | <br /> |
| `error`              | 双向     | `{ code?, message, detail? }`                            | 错误                             | <br /> |
| `map.ready`          | map→外部 | `{ ok: true }`                                           | 地图初始化完成                        | <br /> |
| `map.locate`         | 外部→map | `{ lngLat, zoom, styleIcon? }`                           | local定位标签                        | <br /> |
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

### 1.3 apis接口

#### 1.3.1 基础消息结构

```
// 基础消息结构
{
  "eventKey": "map.locate",  //消息类型，决定这条消息是干什么的
  "id": "req_20260423_001",  //请求唯一 ID，方便追踪、应答、排错
  "system": "dispatch", // 上游系统
  "ts": 1776920000000,   //发送时间
  "data": {} //真正业务数据
}
```

#### 1. 地图定位类

##### 操作屏通知地图屏：定位到某个点、某个地址；

```
// 按经纬度定位
{
  "type": "map.locate",  // 定位
  "data": {
    "lngLat": [121.4737, 31.2304], // 经纬度

    <!-- 可选参数 -->
    "zoom": 15, // 缩放级别
    "marker": true,     // 是否显示标记
    "markerLabel": "报警点" // 标记文本
    "styleIcon": "fire_truck" // 标式图标
  }
}
```

#### 2. 路线规划类

##### 操作屏通知地图屏：请求多路径规划

```
// 路线规划
{
  "eventKey": "route.plan.request",
  "data": {
    "alarmId": "INC20260423001",
    "transportMode": "driving",  // 交通方式
    "carType": "11", // 车辆类型
    "alarmData": 
      {
        "targetId": "target_001",
        "gisX": 121.4737,
        "gisY": 31.2304,
        "info": {}, // 详情展示
        // ...info ,
      }
    ,
    "fireBrigade": [
      {
        "id": "fire_truck_001",
        "orgName": "消防支队",
        "orgType": "fire_truck",
        "gisX": 121.465,
        "gisY": 31.226, 
        "info": {}, // 详情展示
        attrs: {
          vehicles: [
            {
              id: "ambulance_002",
              carName: "珠海消防中队云梯消防车",
              carType: "ambulance",
              gisX: 121.465,
              gisY: 31.321,
              info: {},
            },
          ]
        }
      },
      {
        "id": "ambulance_002",
        "orgName": "珠海消防中队",
        "orgType": "ambulance",
        "gisX": 121.465,
        "gisY": 31.321,
        "info": {}, // 详情展示
      }
    ]
  }
}
```

### 1.X 轻量兼容载荷（兼容 legacy）

为了兼容旧系统或第三方，只要求最小结构：

```json
{ "eventKey": "xxx", "data": {} }
```

兼容旧格式：

```json
{ "type": "dispatchUpdate", "payload": {} }
```

store 会通过 `LEGACY_MESSAGE_TYPE_MAP` 自动归一为 `eventKey`。

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

