# GIS 静态资源图层组设计文档

> 版本：v1.0
> 日期：2026-07-31
> 状态：需求基线

***

## 一、资源图层组定位

本章节定义 GIS 地图中所有静态资源图层的统一渲染规格。静态资源图层指 GeoServer 发布的空间矢量图层，由 GeoServer WMS 统一管理渲染，前端只传入过滤条件不代理数据。

***

## 二、资源图层组矩阵

| 图层名称           | 几何类型  | 关键属性              | 符号化重点           | 刷新策略    |
| -------------- | ----- | ----------------- | --------------- | ------- |
| 消防站            | 点     | 站名、等级、在编力量摘要      | 按站级 / 状态区分图标    | 状态变更或定时 |
| 消火栓            | 点     | 编号、状态（可用 / 停用）、类型 | 可用 = 绿色，停用 = 灰色 | 状态变更    |
| 重点单位           | 点 / 面 | 单位名称、风险等级         | 按风险等级上色         | 低频      |
| 水源（水池 / 天然水源等） | 点 / 面 | 类型、可用状态           | 区分可用与不可用        | 状态变更    |
| 消防设施（其他）       | 点     | 类型、状态             | 按类型图标           | 低频      |

***

## 三、符号化说明

### 3.1 消防站

| 站级  | 图标样式    |
| --- | ------- |
| 一级站 | 一级站专用图标 |
| 二级站 | 二级站专用图标 |
| 三级站 | 三级站专用图标 |
| 小型站 | 小型站图标   |
| 前置点 | 前置点图标   |

### 3.2 消火栓

| 状态 | 图标颜色 |
| -- | ---- |
| 可用 | 绿色   |
| 停用 | 灰色   |

### 3.3 重点单位

| 风险等级 | 渲染颜色 |
| ---- | ---- |
| 重大风险 | 红色   |
| 较大风险 | 橙色   |
| 一般风险 | 黄色   |
| 低风险  | 蓝色   |
| 无风险  | 绿色   |

### 3.4 水源

| 可用状态 | 渲染样式      |
| ---- | --------- |
| 可用   | 实心图标      |
| 不可用  | 空心 / 灰色图标 |

### 3.5 消防设施（其他）

| 类型     | 图标      |
| ------ | ------- |
| 室内外消火栓 | 消火栓专用图标 |
| 灭火器    | 灭火器图标   |
| 喷淋系统   | 喷淋图标    |
| 其他设施   | 通用设施图标  |

***

## 四、组件内部逻辑

### 4.1 初始化注册

`GenericController` 在构造时持有 `OlMap` 实例，并将所有子控制器挂载到自身。`ViewController` 劫持 `map.getLayers()` 的 `push/remove`，自动将图层存入 `layerCachePool`：

```typescript
// ViewController.ts
export class ViewController {
  private layerCachePool = new Map<string, BaseLayer>();

  constructor(private map: OlMap) {
    this.interceptMapLayers();
  }

  private interceptMapLayers() {
    const layers = this.map.getLayers();
    layers.push = (layer: BaseLayer, ...rest) => {
      this.cacheLayer(layer);
      return originalPush(layer, ...rest);
    };
    layers.remove = (layer: BaseLayer) => {
      this.uncacheLayer(layer);
      return originalRemove(layer);
    };
  }

  private cacheLayer(layer: BaseLayer) {
    const id = layer.get('id') || layer.getClassName?.() || '';
    if (id) this.layerCachePool.set(id, layer);
  }
}
```

`InputController.initSubscriptions()` 按 `MESSAGE_EVENT_KEY` 统一注册所有协议事件：

- **通用控制层**：`MAP_BASE_ES_QUERY` → `SpatialController.esQuery`
- **值守阶段**：`LAYER_SET_VISIBLE` → `DutyController.layerSetVisible`
- **来电/问询阶段**：`AOI_ES_QUERY` → `CallController.aoiEsQuery`
- **调派阶段**：`DISPATCH_RESOURCE_QUERY_HIGHLIGHT` → `DispatchController.dispatchResourceQueryHighlight`

### 4.2 资源图层显示隐藏

`ViewController.layerToggle(data: LayerToggleData)` 从缓存池查找图层并设置可见性：

```typescript
public layerToggle(data: LayerToggleData) {
  const layerId = this.resolveLayerId(data.layerId);
  this.toggleCallbacks.get(layerId)?.(data.visible);
  const layer = this.findLayerFromCache(layerId);
  if (layer) {
    layer.setVisible(data.visible);
  }
}

private findLayerFromCache(layerId: string): BaseLayer | undefined {
  const layer = this.layerCachePool.get(layerId);
  if (layer) return layer;
  // 兜底：通过 className / source LAYERS 参数匹配
  for (const [, l] of this.layerCachePool) {
    if (this.matchLayerId(l, layerId)) return l;
  }
  return undefined;
}
```

图层显隐由 `useDispatchMapStore` 的 `checkedIds` 管理，Toolbar 修改 `checkedIds` 触发 `ViewController.layerToggle`。

### 4.3 过滤组件函数

**空间过滤**：`SpatialController.esQuery(data: EsQueryData)` 构建 CQL Filter 并叠加到 `gis:mapresource` 聚合图层：

```typescript
public async esQuery(data: EsQueryData): Promise<any> {
  const cqlFilter = this.buildCqlFilter(data.geometry);
  if (!cqlFilter) return null;

  // 资源检索固定走聚合图层 gis:mapresource
  const layerName = 'gis:mapresource';
  const wmsParams = { LAYERS: layerName, CQL_FILTER: cqlFilter };

  if (!this.queryWmsLayer) {
    this.queryWmsLayer = new TileLayer({
      source: new TileWMS({ url: geoserverApi.getWMSServiceUrl('gis'), params: wmsParams }),
      zIndex: 10,
    });
    this.map.addLayer(this.queryWmsLayer);
  } else {
    this.queryWmsLayer.getSource()?.updateParams(wmsParams);
  }
  return { layerName, cqlFilter, types: data.types };
}

private buildCqlFilter(geometry: any): string | null {
  if (geometry?.type === 'Circle') {
    return `DWITHIN(geom, Point(${lng} ${lat}), ${radius},meters)`;
  }
  if (geometry?.type === 'Polygon') {
    return `INTERSECTS(geom, POLYGON(${coords}))`;
  }
  return null;
}
```

**WMS 图层刷新**：`ViewController.layerRefresh(data: LayerRefreshData)` 对缓存池中 `TileWMS / ImageWMS` 源更新 `timestamp` 参数触发重新请求：

```typescript
public layerRefresh(data: LayerRefreshData) {
  const timestamp = data.timestamp ?? Date.now();
  for (const layerName of data.layerNames) {
    const layer = this.findLayerFromCache(layerName);
    const source = layer?.getSource?.();
    if (source instanceof TileWMS || source instanceof ImageWMS) {
      source.updateParams({ _t: timestamp });
      source.refresh();
    }
  }
}
```

### 4.4 协议触发业务走向

`InputController` 是协议到业务函数的路由中枢，通过 `MESSAGE_EVENT_KEY` 分发到不同子控制器：

| 协议事件 | 触发函数 | 业务走向 |
|---------|---------|---------|
| `MAP_BASE_ES_QUERY` | `SpatialController.esQuery` | WMS 检索，返回 layerName + cqlFilter |
| `DISPATCH_RESOURCE_QUERY_HIGHLIGHT` | `DispatchController.dispatchResourceQueryHighlight` | 缓冲计算 → 画多边形 → 调用 esQuery 高亮资源 |
| `AOI_ES_QUERY` | `CallController.aoiEsQuery` | 微围栏范围内资源检索 |
| `LAYER_SET_VISIBLE` | `DutyController.layerSetVisible` | 按场景控制图层显隐 |
| `LAYER_REFRESH` | `ViewController.layerRefresh` | WMS 瓦片强制刷新 |

`DispatchController.dispatchResourceQueryHighlight` 展示完整调用链：

```typescript
public dispatchResourceQueryHighlight(data) {
  // 1. 缓冲计算
  const bufferGeo = spatial.calcBuffer({
    input: { center: [lng, lat], radius }
  });
  // 2. 绘制缓冲圈
  if (data.highlight && bufferGeo) {
    geometry.drawPolygon({ id: `buffer_${id}`, geometry: bufferGeo });
  }
  // 3. 空间检索
  void spatial.esQuery({
    geometry: { type: 'Circle', center: [lng, lat], radius },
    types: data.resourceTypes,
    limit: 10000,
  });
}
```

### 4.5 最终渲染实现效果

渲染结果通过 `OutputController` 抛出事件对外暴露：

| 抛出事件 | 触发时机 | 携带数据 |
|---------|---------|---------|
| `MAP_VIEW_CHANGED` | 地图视口变化 | `{ zoom, center, bounds }` |
| `MAP_FEATURE_PICK` | 要素拾取 | `{ layerId, featureId, properties }` |
| `MAP_LAYER_VISIBLE_CHANGE` | 图层显隐变更 | `{ layerId, visible }` |
| `ROUTE_PLAN_RESULT` | 路径规划完成 | `{ coordinates, distanceMeters }` |

前端渲染最终依赖 `TileWMS` 瓦片图层（`queryWmsLayer`），`zIndex=10`，叠加在 OpenLayers `OlMap` 底图之上。WMS 请求由 `geoserverApi.getWMSServiceUrl('gis')` 构造，目标图层为 `gis:mapresource`。

### 4.6 组件状态

| 状态 | 来源 | 说明 |
|------|------|------|
| `map` | `useDispatchMapStore` | OpenLayers Map 实例 |
| `checkedIds` | `useDispatchMapStore` | 当前勾选图层 ID 列表 |
| `layerCachePool` | `ViewController` | 已注册图层缓存 |
| `queryWmsLayer` | `SpatialController` | 当前活跃的空间检索瓦片层 |

***

## 五、外部控制接口

### 5.1 查询接口（外部 → 静态资源图层组）

静态资源图层组支持两种空间选择方式，由外部传入参数决定：

**方式一：视口（Viewport）**

```
输入：viewport bounds (westLng, southLat, eastLng, northLat)
输出：当前地图可视范围内所有静态资源
```

**方式二：中心点 + 半径（CIRCLE）**

```
输入：center [longitude, latitude] + radius_meters + radius_unit
输出：该圆形范围内的所有静态资源
```
# 六、用户故事场景

> 静态资源图层组在 **S1 值守**、**S3 接警问询**、**S4 图上调派**、**S5 跟踪到场** 四个场景中使用。

### 6.1 US-S1（值守阶段）

**触发**：以接警身份上线初始化页面

**动作**：

1. 监听地图缩放变化
2. 缩放 ≥ 18 级时，按视口范围调用查询接口
3. GeoServer 返回瓦片，前端渲染静态资源图标
4. 缩放 < 18 级时清空图层

### 6.2 US-S3（接警问询阶段）

**触发**：警情接入，微围栏已确认

**动作**：

1. 获取微围栏 geom 或中心点 + 半径参数
2. 以中心点 + 1000m 圆形范围调用查询接口
3. GeoServer 返回瓦片，前端叠加渲染
4. 退出问询时清空图层

### 6.3 US-S4（图上调派阶段）

**触发**：警情确认，进入调派阶段

**动作**：

1. 复用 S3 阶段已建立的中心点 + 半径参数
2. 重新调用查询接口刷新图层
3. 图层保持显示
4. 退出调派时清空图层

### 6.4 US-S5（跟踪到场阶段）

**触发**：救援到达现场

**动作**：

1. 复用 S3/S4 阶段参数
2. 调用查询接口刷新图层
3. 点击图标展示详情（编号、状态、地址等）
4. 退出跟踪时清空图层

***

## 七、事件订阅

静态资源图层组订阅以下外部事件：

| 事件名                      | 来源     | 触发时机                    | 组件动作                        |
| ------------------------ | ------ | ----------------------- | --------------------------- |
| `ModeChanged`            | 工作台    | 场景切换（S1 ↔ S3 ↔ S4 ↔ S5） | 清空画布，按新场景重新加载               |
| `ZoomChanged`            | 地图组件   | 缩放级别变化                  | S1 下缩放 < 18 级清空；≥ 18 级按视口查询 |
| `IncidentFenceConfirmed` | 接警问询模块 | 微围栏已确认                  | 以中心点 + 半径加载图层               |
| `InquiryExited`          | 接警问询模块 | 退出问询 / 归档               | 清空图层                        |

***

## 八、数据来源

数据来源为 `src/config/layers.ts` 中的 `LAYER_SOURCE_CONFIGS`。

| 图层名称      | Layer ID                   | GeoServer typeName         | ES 查询 | 默认可见 |
| --------- | -------------------------- | -------------------------- | :---: | :--: |
| 消防站（主管队站） | `gis:view_res_org_dept`    | `gis:view_res_org_dept`    |   否   |   是  |
| 消火栓       | `gis:env_fire_water`       | `gis:env_fire_water`       |   是   |   否  |
| 重点单位      | `gis:view_env_enterprises` | `gis:view_env_enterprises` |   否   |   否  |
| 消防车辆      | `gis:env_car`              | `gis:fire_vehicle`         |   否   |   否  |
| 未结案警情     | `gis:disaster_info`        | `gis:disaster_info`        |   否   |   是  |
| 来电定位      | `gis:incoming_call`        | `gis:incoming_call`        |   否   |   是  |
| 街道区划      | `gis:env_area_fence`       | `gis:env_area_fence`       |   否   |   否  |
| 队站辖区      | `gis:view_juris_zone`      | `gis:view_juris_zone`      |   否   |   否  |
| 小区微围栏     | `gis:env_build_aoi`        | `gis:env_build_aoi`        |   否   |   否  |
| 兴趣点       | `gis:env_place_poi`        | `gis:env_place_poi`        |   否   |   否  |
| 建筑        | `gis:view_env_building`    | `gis:view_env_building`    |   否   |   否  |
| 出入口       | `gis:env_entrance_exit`    | `gis:env_entrance_exit`    |   否   |   否  |
| 局部道路      | `gis:env_greatchina_road`  | `gis:env_greatchina_road`  |   否   |   否  |
| 人密场所      | `gis:env_crowd_place`（占位）  | `gis:env_crowd_place`（占位）  |   待定  |   否  |

***

## 九、协议层

> 协议层定义静态资源图层组与 GeoServer 之间的通信契约，包括 WMS 请求结构和 CQL Filter 编译规则。

### 9.1 WMS 请求结构

前端持 BFF 返回的 `render_plan`，直连 GeoServer WMS 请求图层瓦片：

```
GET /geoserver/gis/wms
  ?service=WMS
  &version=1.3.0
  &request=GetMap
  &layers={layers}
  &bbox={bounds}
  &width=512
  &height=512
  &format=image/png
  &crs=EPSG:4490
  &cql_filter={filter_expr}
  &style={style}
```

### 9.2 WFS 请求结构

按需查询要素 GeoJSON 时使用：

```
GET /geoserver/gis/wfs
  ?service=WFS
  &version=2.0.0
  &request=GetFeature
  &typeNames={layer}
  &outputFormat=application/json
  &cql_filter={filter_expr}
  &propertyName={fields}
  &count={limit}
```

### 9.3 CQL Filter 编译规则

BFF 将前端传入的过滤参数编译为 GeoServer CQL Filter，静态资源图层组直接使用。

**范围过滤 → 空间谓词**

| 范围模式       | CQL 表达                                         | 示例                                                             |
| ---------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `CIRCLE`   | `DWITHIN(geom, POINT(lon lat), radius, units)` | `DWITHIN(geom, POINT(118.786 32.042), 1000, meters)`           |
| `AOI`      | `INTERSECTS(geom, POLYGON((...)))`             | `INTERSECTS(geom, POLYGON((118.78 32.04, 118.80 32.04, ...)))` |
| `VIEWPORT` | `BBOX(geom, west, south, east, north)`         | `BBOX(geom, 118.78, 32.04, 118.80, 32.06)`                     |

**字段过滤 → 属性谓词**

| 过滤类型 | 操作符              | 示例                                                                |
| ---- | ---------------- | ----------------------------------------------------------------- |
| 状态过滤 | `=`              | `is_enabled=true`                                                 |
| 文本检索 | `LIKE` / `ILIKE` | `water_name ILIKE '%软件园%' OR address ILIKE '%软件园%'`               |
| 类型过滤 | `IN`             | `intake_form IN ('地上式', '地下式')`                                   |
| 时间范围 | `>=` + `<=`      | `launched_time >= '2020-01-01' AND launched_time <= '2025-12-31'` |

**组合规则**

- 范围过滤与字段过滤之间用 `AND` 连接
- 多个字段过滤之间用 `AND` 连接
- 文本检索多字段之间用 `OR` 连接
- `is_deleted=false` 基线规则始终内联

**完整 CQL Filter 示例**

```
DWITHIN(geom, POINT(118.786 32.042), 1000, meters)
AND is_enabled=true
AND is_deleted=false
AND (water_name ILIKE '%软件园%' OR address ILIKE '%软件园%')
```

### 9.4 GeoServer 图层标识

| 资源类型 | GeoServer Layer ID  | 数据表                       |
| ---- | ------------------- | ------------------------- |
| 消防站  | `gis:fire_station`  | `public.fire_station`     |
| 消火栓  | `gis:env_hydrant`   | `public.res_water`        |
| 重点单位 | `gis:key_unit`      | `public.key_unit`         |
| 水源   | `gis:water_source`  | `public.res_water_source` |
| 消防设施 | `gis:fire_facility` | `public.fire_facility`    |

### 9.5 GeoServer SLD 样式标识

| 资源类型 | 默认样式                    | 样式规则         |
| ---- | ----------------------- | ------------ |
| 消防站  | `fire_station_default`  | 按站级          |
| 消火栓  | `hydrant_default`       | 可用=绿色，停用=灰色  |
| 重点单位 | `key_unit_default`      | 按风险等级        |
| 水源   | `water_source_default`  | 可用=实心，不可用=空心 |
| 消防设施 | `fire_facility_default` | 按设施类型        |

