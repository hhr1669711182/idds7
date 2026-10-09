# 02-技术设计 / 前端 / 单元测试

> 单元测试文档索引。

## ⚠️ 现状说明

本项目**当前未配置单元测试框架**（无 vitest/jest 依赖、无 `test` 脚本）。`tests/**` 下的 `.test.ts` 为历史遗留脚本，需自备 runner 执行。

若需引入测试框架，建议：vitest + @vue/test-utils，并在 `package.json` 增加 `test` 脚本。引入属工程决策，需在技术方案中说明。

## 文档列表

| 文档 | 覆盖模块 | 状态 |
|------|---------|------|
| （待补充） | | |

## 建议优先覆盖的纯逻辑模块（无 DOM / 无引擎依赖，便于单测）

| 模块 | 位置 | 建议用例 |
|------|------|---------|
| 坐标转换 | `src/utils/coordTransform.ts` | WGS84/GCJ02/BD09 互转边界 |
| 地图配置归一 | `src/config/mapConfig.ts` | 分组排序、enabled/visible 归一、持久化容错 |
| 消息体归一 | `src/interceptor/unwrap.ts` | JSON 字符串解析、topics 大小写、非法输入 |
| 订阅匹配 | `src/interceptor/matcher.ts` | CUSTOM / SEAT 匹配、key 匹配 |
| 调度校验 | `src/service/methods/dispatchVehicles.ts` | `validateDispatchRequest` 边界 |
| 错误转换 | `src/service/error.ts` | `toAppError` 各类错误映射 |