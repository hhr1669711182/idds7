# mapPlugins 使用文档

> 目录实际为 `src/plugins/mapplugins`（Windows 下大小写不敏感）。对外建议通过库入口 `src/lib/index.ts` 导出使用。

## 核心概念

- `MapCore`：OpenLayers `Map` 的生命周期与插件容器。
- `MapPlugin`：每个能力模块都实现统一接口：`key` / `apply(map)` / `dispose()`。

`MapCore` 负责：创建地图、`.use()` 注入插件、`.get()` 取回插件实例、`.remove()` 移除插件、`.destroy()` 统一销毁（入口/出口闭环）。

## 安装与引入

项目内直接用库出口：

```ts
import {
  MapCore,
  useBaseMap,
  useCoreControl,
  useMapStatus,
  useOverlay,
  useDraw,
  useFeatureStyle,
  useRoutePlan,
  useBusUpWMS,
  useMapUtils,
} from '@/lib';
```

也可以从插件目录入口引入：

```ts
import { MapCore, useBaseMap } from '@/plugins/mapplugins';
```

## 快速开始（组合式插件）

```ts
import View from 'ol/View';
import { fromLonLat } from 'ol/proj';

import {
  MapCore,
  useBaseMap,
  useCoreControl,
  useMapStatus,
  useDraw,
} from '@/plugins/mapplugins';

const core = new MapCore({
  target: document.getElementById('map')!,
  view: new View({
    center: fromLonLat([114.314521, 22.543021]),
    zoom: 12,
  }),
})
  .use(useBaseMap({
    maps: [
      { id: 'osm', xyzUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },
    ],
    initial: 'osm',
  }))
  .use(useCoreControl())
  .use(useMapStatus())
  .use(useDraw({ enableModify: true, enableSnap: true }));

const map = core.map;
```

### 获取插件实例

插件 `key`：

- `baseMap`
- `coreControl`
- `featureStyle`
- `mapStatus`
- `overlay`
- `draw`
- `routePlan`
- `busUpWMS`
- `mapUtils`

```ts
import type { DrawPlugin } from '@/plugins/mapplugins';

const draw = core.get<DrawPlugin>('draw');
```

### 销毁（闭环）

```ts
core.destroy();
```

## 各插件怎么用

### 1) `useBaseMap` 底图管理（key: `baseMap`）

- `register(def)`：注册底图（`xyzUrl` 或直接传 `layer`）
- `setActive(id)`：切换底图
- `getActive()`：获取当前底图 id

```ts
const baseMap = core.get<any>('baseMap');
baseMap?.setActive('osm');
```

### 2) `useCoreControl` 控件管理（key: `coreControl`）

默认会注册：`ZoomSlider` / `FullScreen` / `ScaleLine` / `OverviewMap` / `ZoomToExtent`。

```ts
const coreControl = core.get<any>('coreControl');
coreControl?.remove('overview');
```

### 3) `useFeatureStyle` 样式工厂与缓存（key: `featureStyle`）

- `register(key, factory)`：注册样式工厂
- `get(key, params, cacheKey?)`：取样式（带缓存）
- `clearCache()`：清缓存

```ts
import { Style, Stroke } from 'ol/style';

core.use(useFeatureStyle({
  factories: {
    route: ({ color }: { color: string }) => new Style({ stroke: new Stroke({ color, width: 4 }) }),
  },
}));

const st = core.get<any>('featureStyle')?.get('route', { color: '#2563EB' });
```

### 4) `useMapStatus` 图层/要素状态管理（key: `mapStatus`）

- `addLayer(id, layer)` / `getLayer(id)` / `removeLayer(id)`
- `setLayerVisible(id, visible)` / `setLayerOpacity(id, opacity)`
- `ensureVectorLayer(id)`：保证 VectorLayer 存在
- `addFeature(layerId, feature)` / `clearFeatures(layerId)`

```ts
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';

const status = core.get<any>('mapStatus');
status.ensureVectorLayer('markers');
status.addFeature('markers', new Feature({ geometry: new Point([0, 0]) }));
```

### 5) `useOverlay` 弹窗管理（key: `overlay`）

- `create({ id, coordinate, element/html, ... })`
- `setPosition(id, coordinate)`
- `remove(id)`

```ts
const overlay = core.get<any>('overlay');
overlay?.create({ id: 'alarm', coordinate: [0, 0], html: '<div>报警</div>' });
overlay?.setPosition('alarm', [10, 10]);
```

### 6) `useDraw` 绘图工具链（key: `draw`）

支持：`Point` / `LineString` / `Polygon` / `Circle` / `Box` / `Square`。

```ts
const status = core.get<any>('mapStatus');
const drawLayer = status.ensureVectorLayer('draw');

const draw = core.get<any>('draw');
draw.bindLayer(drawLayer);
draw.start('Polygon', (e: any) => {
  const feature = e.feature;
});
```

### 7) `useRoutePlan` 路径规划（key: `routePlan`）

通过注入 `planner(req)` 解耦具体路线服务，插件内部负责渲染。

```ts
core.use(useRoutePlan({
  planner: async ({ origin, destination }) => ({
    path: [origin, destination],
    distanceMeters: 0,
    durationSeconds: 0,
  }),
}));

await core.get<any>('routePlan')?.plan({
  origin: [114.314521, 22.543021],
  destination: [114.32, 22.55],
});
```

### 8) `useBusUpWMS` WMS 上图（key: `busUpWMS`）

- `addTile({ id, url, params })` / `addImage({ id, url, params })`
- `remove(id)`
- `fetchText(url)`：使用 `request`（默认 `fetch`）拉取文本

```ts
core.use(useBusUpWMS({ request: (input, init) => fetch(input, init) }));

core.get<any>('busUpWMS')?.addTile({
  id: 'layer1',
  url: 'https://your-geoserver/wms',
  params: { LAYERS: 'workspace:layer', TILED: true },
});
```

### 9) `useMapUtils` 常用工具（key: `mapUtils`）

- `flyTo([lng, lat], zoom?, durationMs?)`
- `animateTo(coordinate, zoom?, durationMs?)`
- `geocode(address)` / `reverseGeocode([lng, lat])`（通过注入实现）

```ts
core.use(useMapUtils({
  geocode: async (address) => [{ address, location: [114.314521, 22.543021] }],
  reverseGeocode: async (location) => [{ address: 'xxx', location }],
}));

core.get<any>('mapUtils')?.flyTo([114.314521, 22.543021], 14);
```

## 组合建议（低耦合高内聚）

- 底层能力：`MapCore` + `useBaseMap` + `useCoreControl` + `useMapStatus`
- 交互能力：叠加 `useDraw` / `useOverlay`
- 业务能力：`useBusUpWMS` / `useRoutePlan` / `useMapUtils` 通过“注入”对接不同业务 API

## 约定与注意事项

- 插件 `key` 必须唯一；若需要替换插件，建议先 `core.remove(key)` 再 `.use()`。
- `destroy()` 会统一调用所有插件的 `dispose()` 并 `setTarget(undefined)`。
