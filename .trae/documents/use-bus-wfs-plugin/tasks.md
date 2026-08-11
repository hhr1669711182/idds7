# useBusWFS 插件新增任务拆解（Tasks）

- [ ] Task 1：对齐现有插件规范与命名
  - [ ] SubTask 1.1：确认目录大小写使用 `src/plugins/mapPlugins/plugins/`（项目当前为 `mapPlugins`，非 `mapplugins`）
  - [ ] SubTask 1.2：确认 `MapPlugin` 接口要求（`key/apply/dispose`）并与 `useBusUpWMS` 代码风格一致

- [ ] Task 2：新增 `useBusWFS.ts` 插件骨架
  - [ ] SubTask 2.1：创建 `BusWfsPluginOptions`，定义 `request?: RequestClient`
  - [ ] SubTask 2.2：实现 `BusWfsPlugin implements MapPlugin`
    - [ ] `key` 建议为 `'busWFS'`
    - [ ] `apply(map)` 持有 map 引用
    - [ ] `dispose()` 清理全部图层与引用
  - [ ] SubTask 2.3：提供 `useBusWFS()` 工厂函数导出

- [ ] Task 3：实现 WFS 请求能力（最小可用）
  - [ ] SubTask 3.1：定义 WFS 图层配置类型（例如 `id/url/typeName/outputFormat/srsName/params`）
  - [ ] SubTask 3.2：实现 `addLayer()`（或 `addVector()`）创建 VectorLayer 并挂载到 map
  - [ ] SubTask 3.3：实现 `refresh(id)` 或 `load(id, query)`：通过 WFS GetFeature 获取 GeoJSON 并更新 VectorSource
  - [ ] SubTask 3.4：所有网络请求必须使用 `const req = options.request ?? fetch`

- [ ] Task 4：资源管理能力补齐
  - [ ] SubTask 4.1：实现 `remove(id)`：从 map 移除图层并释放缓存
  - [ ] SubTask 4.2：异常处理：请求失败时抛出带上下文的错误（包含 url / typeName / status）

- [ ] Task 5：ESM 导出更新
  - [ ] SubTask 5.1：更新 `src/plugins/mapPlugins/index.ts`：`export * from './plugins/useBusWFS';`
  - [ ] SubTask 5.2：验证 `src/lib/index.ts` 的聚合导出无需变更（已有 `export * from '@/plugins/mapPlugins'`）

- [ ] Task 6：验证与回归检查
  - [ ] SubTask 6.1：本地 `build:lib` 验证产物可从 ESM 入口解构导入 `useBusWFS`
  - [ ] SubTask 6.2：TypeScript 类型检查通过（`vue-tsc` / `tsc` 视项目脚本而定）

## Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 2
- Task 4 依赖 Task 2, Task 3
- Task 5 依赖 Task 2
- Task 6 依赖 Task 3, Task 5
