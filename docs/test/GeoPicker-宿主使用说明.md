# GeoPicker 嵌入宿主使用说明

> GeoPicker 是 ids-gis-web 提供的两个独立路由页面，可被任何外部项目通过 `<iframe>` 嵌入，提供「选点」和「选辖区」两个能力。
> 本页说明宿主接入方式、双向通信协议和数据格式。

---

## 1. 嵌入方式

### 路由地址（hash 模式）

| 能力 | URL |
|------|-----|
| 选点 | `http(s)://<host>/#/pickPoint` |
| 选辖区 | `http(s)://<host>/#/pickJurisdiction` |

示例：

```
http://ids-dev.ks.telewave.tech/gis-web/#/pickPoint
http://ids-dev.ks.telewave.tech/gis-web/#/pickJurisdiction
```

### HTML 示例

```html
<iframe
  id="gp"
  src="http://host/#/pickPoint"
  width="100%"
  height="600"
  frameborder="0"
></iframe>
```

> 默认日间主题。宿主可发 `geoPicker.theme` 指令切夜间。

---

## 2. 通信协议

通过 `window.postMessage` 双向通信。所有消息信封格式统一：

```json
{
  "eventKey": "事件名",
  "data": { /* 负载 */ }
}
```

### 坐标系

协议层统一 **WGS84 `[经度, 纬度]`**，与地图内部投影无关。

---

## 3. GeoPicker → 宿主（出站事件）

宿主在 `window` 上监听 `message` 事件，过滤 `e.data.eventKey`。

### 3.1 `geoPicker.ready`

地图渲染完成，可接受后续指令。

```json
{ "eventKey": "geoPicker.ready", "data": { "ok": true } }
```

### 3.2 `geoPicker.pointPicked`

**仅选点页面**触发。以下时机都会重发：
- 用户单击地图画点
- 宿主发 `geoPicker.locate` 定位（选点页面自动把该坐标上图）
- 撤销 / 重做
- 点要素被拖动编辑结束

```json
{
  "eventKey": "geoPicker.pointPicked",
  "data": { "lng": 116.404, "lat": 39.915 }
}
```

### 3.3 `geoPicker.jurisdictionPicked`

**仅选辖区页面**触发。以下时机重发：
- 用户双击结束绘制多边形
- 撤销 / 重做
- 拖动编辑顶点结束

```json
{
  "eventKey": "geoPicker.jurisdictionPicked",
  "data": {
    "coordinates": [
      [ [116.40,39.90], [116.41,39.90], [116.41,39.91], [116.40,39.91], [116.40,39.90] ]
    ]
  }
}
```

> `coordinates` 为 GeoJSON Polygon 结构（三维数组：Polygon → Ring → Point），已闭合（首尾点相同），轴序 `[lng, lat]`。

### 3.4 `geoPicker.cleared`

当前要素被清除。触发时机：
- 用户点工具栏「清除」
- 宿主发 `geoPicker.clear`
- 选辖区页面**开始画新多边形**时（自动清旧，立即发 cleared，再发新的 jurisdictionPicked）

```json
{ "eventKey": "geoPicker.cleared", "data": null }
```

### 出站事件汇总

| eventKey | 选点页 | 选辖区页 | data |
|----------|:------:|:--------:|------|
| `geoPicker.ready` | ✅ | ✅ | `{ ok: true }` |
| `geoPicker.pointPicked` | ✅ | ❌ | `{ lng, lat }` |
| `geoPicker.jurisdictionPicked` | ❌ | ✅ | `{ coordinates: number[][][] }` |
| `geoPicker.cleared` | ✅ | ✅ | `null` |

---

## 4. 宿主 → GeoPicker（入站指令）

宿主通过 `iframe.contentWindow.postMessage(payload, '*')` 发送。

### 4.1 `geoPicker.locate`

飞到指定经纬度。**选点页面额外行为**：把该坐标作为已画好的点上图（立即触发 `pointPicked` 出站）。

```json
{
  "eventKey": "geoPicker.locate",
  "data": { "lng": 116.40, "lat": 39.90, "zoom": 14 }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `lng` | number | ✅ | 目标经度，范围 [-180, 180] |
| `lat` | number | ✅ | 目标纬度，范围 [-90, 90] |
| `zoom` | number | 否 | 目标缩放级别，不传则保持当前 |

### 4.2 `geoPicker.clear`

清空当前绘制（撤销 / 重做历史一并重置）。GeoPicker 立即回传 `cleared`。

```json
{ "eventKey": "geoPicker.clear", "data": {} }
```

### 4.3 `geoPicker.theme`

切换 UI 主题色（只影响工具栏 / 控件，**不动底图**）。默认日间。

```json
{ "eventKey": "geoPicker.theme", "data": { "theme": "day" } }
```

| `theme` 值 | 效果 |
|------------|------|
| `"day"` | 日间主题（默认） |
| `"night"` | 夜间主题 |

### 入站指令汇总

| eventKey | data | 生效页面 |
|----------|------|----------|
| `geoPicker.locate` | `{ lng, lat, zoom? }` | 两页都生效（选点页额外上图） |
| `geoPicker.clear` | `{}` | 两页 |
| `geoPicker.theme` | `{ theme: "day" \| "night" }` | 两页 |

---

## 5. 宿主代码示例

```html
<!DOCTYPE html>
<html>
<body>
  <iframe id="gp" src="http://host/#/pickPoint"
          width="100%" height="700" frameborder="0"></iframe>

  <button onclick="locate()">定位到上海</button>
  <button onclick="clearAll()">清除</button>
  <button onclick="setTheme('night')">夜间</button>
  <button onclick="setTheme('day')">日间</button>

<script>
  const gp = document.getElementById('gp');

  // 接收 GeoPicker 消息
  window.addEventListener('message', (e) => {
    const { eventKey, data } = e.data || {};
    if (!eventKey) return;

    switch (eventKey) {
      case 'geoPicker.ready':
        console.log('GeoPicker 就绪');
        break;
      case 'geoPicker.pointPicked':
        console.log('选点结果:', data.lng, data.lat);
        // { lng: 116.404, lat: 39.915 }
        break;
      case 'geoPicker.jurisdictionPicked':
        console.log('辖区 GeoJSON coordinates:', data.coordinates);
        break;
      case 'geoPicker.cleared':
        console.log('已清除');
        break;
    }
  });

  // 发定位指令（选点页会自动把该坐标上图）
  function locate() {
    gp.contentWindow.postMessage({
      eventKey: 'geoPicker.locate',
      data: { lng: 121.47, lat: 31.23, zoom: 14 },
    }, '*');
  }

  // 发清除指令
  function clearAll() {
    gp.contentWindow.postMessage({ eventKey: 'geoPicker.clear', data: {} }, '*');
  }

  // 切换主题
  function setTheme(t) {
    gp.contentWindow.postMessage({ eventKey: 'geoPicker.theme', data: { theme: t } }, '*');
  }
</script>
</body>
</html>
```

---
