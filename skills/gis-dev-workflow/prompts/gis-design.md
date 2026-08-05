# gis-design Prompt

> 阶段 2：设计
> 调用入口：`$gis-dev-workflow:gis-design`
> 前置技能：`superpowers:brainstorming`（业务问题确认）

---

## 触发条件

- `docs/analysis/01-五层索引目录.md` 已审阅。

## 提示词模板

```text
使用 $gis-dev-workflow:gis-design 根据已确认的分析结果完成五层架构设计。

前置：
1. 调用 superpowers:brainstorming 完成业务问题确认
2. 读取 docs/analysis/01-五层索引目录.md
3. 读取 references/gis-architecture.md、references/gis-coord-system.md、references/gis-controller-patterns.md、references/gis-state-machines.md

输出（七份设计文档，按 00~06 顺序）：
- docs/design/00-设计总览.md
- docs/design/01-业务域设计.md
- docs/design/02-协议层设计.md
- docs/design/03-控制层设计.md
- docs/design/04-渲染层设计.md
- docs/design/05-状态机设计.md
- docs/design/06-异常与降级设计.md

门禁：
- 五层设计无职责冲突、无循环依赖
- 业务/通用/IO 协议字段可逐字段追踪（与 协议层DTO Schema.tsd 对齐）
- 5 个核心场景 AC 全部映射到具体设计产物
- 性能 SLA 全部映射到具体设计产物
- 状态机定义与业务控制层方法一一对应
- 用户完成最终审阅
```

## 工具调用

1. `invoke_superpowers` 调用 `superpowers:brainstorming`
2. `read_documentation` 读取 references/*
3. `write_stage_artifact` 写入 7 份设计文档

## 超时

432000 秒（5 天）
