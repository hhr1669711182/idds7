# 地图阶段控制配置 (Stage Config)

本配置用于响应 `map.view.stageconfig` 事件，根据不同业务阶段（如：值守、来电、接处警）动态加载和控制 GIS 屏的工具栏功能与图层资源。
配置结构被设计为统一的大型 JSON 对象表，便于前端解析及后续后台管理系统的维护。

## 1. 交互协议

**事件方向**：外部（业务系统） -> 地图（GIS屏）
**事件标识**：`map.view.stageconfig`

```json
{ 
  "eventType": "map.view.stageconfig", 
  "data": { 
    "seat_id": "8001", 
    "stage": 1 
  } 
}
```

- `seat_id`: `String` 座席编号。
- `stage`: `Number` GIS 屏当前阶段。`1`: 值守，`2`: 来电，`3`: 接处警。

---

## 2. 阶段资源配置表 (Stage Configuration Schema)

配置表采用 `stages` 作为外层键，通过数字键（`1`, `2`, `3`...）区分不同阶段的配置。
每个阶段包含 `tools`（工具栏组件控制）和 `layers`（图层资源控制）两大模块。

### JSON 结构示例

```json
{
  "stages": {
    "1": {
      "name": "值守阶段",
      "tools": {
        "searchBar": { "visible": true, "disabled": false },
        "measureTool": { "visible": true, "disabled": false },
        "drawTool": { "visible": true, "disabled": false },
        "routePlan": { "visible": false, "disabled": true },
        "aroundSearch": { "visible": false, "disabled": true }
      },
      "layers": {
        "gis:view_res_org_dept": { "visible": true, "opacity": 0.8 },
        "gis:env_fire_water": { "visible": true, "opacity": 1.0 },
        "gis:env_car": { "visible": true, "opacity": 1.0 },
        "gis:disaster_info": { "visible": false, "opacity": 1.0 },
        "gis:view_env_enterprises": { "visible": false, "opacity": 1.0 }
      }
    },
    "2": {
      "name": "来电阶段",
      "tools": {
        "searchBar": { "visible": true, "disabled": false },
        "measureTool": { "visible": false, "disabled": true },
        "drawTool": { "visible": false, "disabled": true },
        "routePlan": { "visible": false, "disabled": true },
        "aroundSearch": { "visible": true, "disabled": false }
      },
      "layers": {
        "gis:view_res_org_dept": { "visible": true, "opacity": 0.8 },
        "gis:env_fire_water": { "visible": false, "opacity": 1.0 },
        "gis:env_car": { "visible": true, "opacity": 0.6 },
        "gis:disaster_info": { "visible": false, "opacity": 1.0 },
        "gis:incoming_call": { "visible": true, "opacity": 1.0 }
      }
    },
    "3": {
      "name": "接处警阶段",
      "tools": {
        "searchBar": { "visible": false, "disabled": true },
        "measureTool": { "visible": true, "disabled": false },
        "drawTool": { "visible": true, "disabled": false },
        "routePlan": { "visible": true, "disabled": false },
        "aroundSearch": { "visible": true, "disabled": false }
      },
      "layers": {
        "gis:view_res_org_dept": { "visible": true, "opacity": 1.0 },
        "gis:env_fire_water": { "visible": true, "opacity": 1.0 },
        "gis:env_car": { "visible": true, "opacity": 1.0 },
        "gis:disaster_info": { "visible": true, "opacity": 1.0 },
        "gis:incoming_call": { "visible": true, "opacity": 1.0 }
      }
    }
  }
}
```

## 3. 配置项说明

### `tools` (工具控制)
控制地图 UI 上的各类操作组件和面板。
- `visible`: 是否在界面上渲染该组件。
- `disabled`: 是否处于禁用状态（可见但不可交互）。

**预设键值说明**：
- `searchBar`: 顶部搜索框
- `measureTool`: 测距/测面工具
- `drawTool`: 圈选/多边形绘制工具
- `routePlan`: 路径规划工具
- `aroundSearch`: 周边资源查询分析面板

### `layers` (图层控制)
控制业务图层、WMS/Vector 资源的加载与显示状态。
- `visible`: 图层是否加载/显示。
- `opacity`: 图层透明度（`0.0` - `1.0`），可用于在某些阶段弱化非核心图层。

**预设键值说明**（需严格对应项目中 `layers.ts` 里的 `id`）：
- `gis:view_res_org_dept`: 主管队站图层
- `gis:env_fire_water`: 消防栓（水源资源）图层
- `gis:env_car`: 消防车辆（作战资源）图层
- `gis:disaster_info`: 未结案警情（警情资源）图层
- `gis:incoming_call`: 来电定位图层
- `gis:view_env_enterprises`: 重点单位图层
