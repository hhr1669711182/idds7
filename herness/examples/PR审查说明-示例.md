# PR 审查说明示例

> 示例文档。演示按 `06-PR审查/_流程规范.md` 编写 MR 描述与审查记录。

---

## 一、MR 描述示例

```markdown
## 变更概述
来电定位标注增加呼吸动画，重复来电覆盖而非叠加。

## 关联
- 关联迭代：2026-W41
- 关联技术方案：herness/examples/技术方案-示例.md
- 关联需求：herness/examples/需求分析-示例.md

## 变更文件
- 修改：src/controller/core/business/CallController.ts
- 修改：src/controller/map/index.ts

## 分层落点
| 改动点 | 层 | 文件 |
|--------|----|------|
| 呼吸动画参数 | 业务控制 | CallController.ts |
| 订阅可取消 | 消息门面 | controller/map/index.ts |

## 测试情况
- 类型门禁：pnpm lint（通过）
- 手工验证：TC-call-01 ~ 04（通过）

## 契约同步
- 事件键 / DTO / 接口：否

## AI 审查
@AI 检查本次MR，重点关注：是否越层、订阅是否取消
```

---

## 二、AI 审查记录示例

| # | 维度 | 级别 | 问题 | 处理 |
|---|------|------|------|------|
| 1 | 订阅链路 | 必须修复 | `onIncomingCall` 返回的取消函数未在 `onUnmounted` 调用 | 已修复 |
| 2 | 分层合规 | 必须修复 | `CallController` 直接 `import 'ol/format/GeoJSON'` | 已修复，改用注入的 `genericController` |
| 3 | 性能 | 可选 | 缓冲区图层每次重建 | 不修复原因：当前数据量小，后续统一图层池优化 |

## 三、结论

必须修复项已闭环，可合入；可选项已在 MR 评论说明。