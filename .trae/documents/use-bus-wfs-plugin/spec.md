# useBusWFS 插件新增规格（Spec）

## 1. 目标（Why）
当前 `mapPlugins` 已支持 `useBusUpWMS`（WMS 上图与可注入请求）。为了支持 **WFS（GetCapabilities / DescribeFeatureType / GetFeature）** 方式加载矢量要素并与项目现有“可注入请求客户端”的模式一致，需要新增 `useBusWFS` 插件，便于宿主在不同鉴权/网关/请求库（fetch / alova / 自研封装）下复用。

## 2. 需求范围（What）
在 `src/plugins/mapPlugins/plugins/` 下新增插件文件：
- `useBusWFS.ts`

并完成 ESM 导出闭环：
- 更新 `src/plugins/mapPlugins/index.ts` 导出 `useBusWFS`
- 确保库入口 `src/lib/index.ts` 通过 `export * from '@/plugins/mapPlugins'` 间接导出后，`useBusWFS` 可被外部 ESM 使用

## 3. 约束与非目标（Constraints / Non-goals）
- **不**引入新的后端服务或代理层；请求注入只发生在插件内部的网络调用。
- **不**强制引入第三方请求库；对外只暴露最小“请求函数”接口。
- **不**在本次范围内新增 UI 页面/组件；仅提供 map plugin 能力。
- **不**做复杂的要素编辑/回写能力（可留作后续扩展）。

## 4. 对外 API 设计（Public API）
### 4.1 文件与导出
- `src/plugins/mapPlugins/plugins/useBusWFS.ts`
  - `export class BusWfsPlugin implements MapPlugin`
  - `export const useBusWFS = (options?: BusWfsPluginOptions) => new BusWfsPlugin(options)`
  - `export type RequestClient = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>`（与 `useBusUpWMS` 保持一致）

### 4.2 Options 设计
```ts
export interface BusWfsPluginOptions {
  request?: RequestClient;
}
```
说明：
- `request` 缺省时回退为全局 `fetch`。
- 宿主若需要注入鉴权 Header、统一超时/重试、日志埋点等，可在注入的 `request` 中实现。

### 4.3 WFS 能力与最小功能面
插件至少提供以下能力（按优先级）：
1) **GetFeature（GeoJSON）加载**：用于将 WFS 要素加载为 `VectorSource/VectorLayer` 并上图
2) **可控的请求注入**：所有网络请求必须走 `options.request ?? fetch`
3) **资源管理与清理**：插件 `dispose()` 时移除图层、注销引用，避免内存泄漏

可选能力（如实现成本可控，可一并提供；否则后续迭代）：
- `GetCapabilities` 拉取与解析（以文本返回，由业务侧解析；或插件内提供轻量解析）
- `DescribeFeatureType` 拉取（同上）

## 5. 核心交互流程（Core Flow）
1. 业务创建 `MapCore` 并注册插件：`mapCore.use(useBusWFS({ request }))`
2. 业务调用插件方法添加 WFS 图层（指定 `url、typeName、srsName、cql_filter/filter、bbox` 等）
3. 插件内部拼接 WFS 请求参数并通过注入的 `request` 发起请求
4. 将响应解析为文本/JSON（最小要求：支持 GeoJSON）并写入 `VectorSource`
5. `remove(id)` 移除图层；`dispose()` 批量清理

## 6. 设计细节：请求注入（Request Injection）
### 6.1 注入点
- 插件内所有网络请求（GetFeature / GetCapabilities / DescribeFeatureType）均使用：
  - `const req = this.options.request ?? fetch;`
  - `const res = await req(url, init);`

### 6.2 约定与兼容性
- `RequestClient` 约定返回 `Response`，以确保插件内部可以统一 `res.text()` / `res.json()`。
- 若宿主使用 alova/axios 等：
  - 建议在宿主侧封装一层适配器，将其响应转换为 `Response` 语义（或直接用 `fetch` + 拦截器）。

## 7. 设计细节：ESM 导出更新（ESM Export Updates）
必须完成以下导出链路：
1. `src/plugins/mapPlugins/index.ts` 新增：
   - `export * from './plugins/useBusWFS';`
2. 由于 `src/lib/index.ts` 已 `export * from '@/plugins/mapPlugins';`，因此库最终 ESM 入口将自动包含 `useBusWFS`。
3. 如项目存在类型聚合/自动导入声明（例如 `src/types/auto-imports.d.ts`），需要评估是否要同步更新（仅当项目约定“所有插件自动导入”时才做）。

## 8. 验收标准（Acceptance Criteria）
- [ ] 在 `src/plugins/mapPlugins/plugins/` 下存在 `useBusWFS.ts`
- [ ] `BusWfsPlugin` 实现 `MapPlugin`（包含 `key/apply/dispose`）
- [ ] 插件对外暴露 `useBusWFS()` 工厂函数
- [ ] 插件网络请求均支持 `options.request` 注入，默认回退 `fetch`
- [ ] `src/plugins/mapPlugins/index.ts` 已导出 `useBusWFS`
- [ ] 外部按 ESM 方式可从库入口解构引入（构建产物层面由 CI/本地 build 验证）
