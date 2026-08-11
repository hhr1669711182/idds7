# useBusWFS 插件交付检查清单（Checklist）

## 代码与结构
- [ ] 新文件位于：`src/plugins/mapPlugins/plugins/useBusWFS.ts`
- [ ] 插件类实现 `MapPlugin`：包含 `key`、`apply(map)`、`dispose()`
- [ ] 对外导出 `useBusWFS()` 工厂函数（与 `useBusUpWMS` 风格一致）

## Request Injection（请求注入）
- [ ] 插件 Options 包含 `request?: RequestClient`
- [ ] 所有网络请求均使用 `options.request ?? fetch`
- [ ] 不直接在插件内部绑定具体请求库（axios/alova 等）
- [ ] 请求失败时错误信息包含足够上下文（status、url、关键参数）

## WFS 最小功能
- [ ] 能通过 WFS GetFeature 拉取数据并上图（至少支持 GeoJSON 输出）
- [ ] 支持按 `id` 管理多个 WFS 图层（add/remove/clear）
- [ ] `dispose()` 会移除已添加图层并清空内部 Map 缓存

## ESM 导出链路
- [ ] `src/plugins/mapPlugins/index.ts` 已追加 `export * from './plugins/useBusWFS';`
- [ ] `src/lib/index.ts` 间接导出后，外部可 `import { useBusWFS } from 'dispatch-model-map'`（以库实际包名为准）
- [ ] `build:lib` 产物中包含对应导出与 `.d.ts` 类型声明

## 回归影响
- [ ] 不影响现有 `useBusUpWMS`、`MapCore` 等插件导出
- [ ] 无额外破坏性变更（未改动现有导出名称/路径）
