# gis-planning Prompt

> 阶段 3：计划
> 调用入口：`$gis-dev-workflow:gis-planning`
> 前置技能：`superpowers:writing-plans`

---

## 触发条件

- 七份设计文档已落盘并经用户最终审阅。

## 提示词模板

```text
使用 $gis-dev-workflow:gis-planning 根据已审阅的设计文档产出可执行计划。

前置：
1. 调用 superpowers:writing-plans
2. 读取 docs/design/** 七份文档
3. 读取 references/* 全部相关章节

输出（六份计划文档，按 00~06 顺序）：
- docs/plan/00-计划总览.md
- docs/plan/01-Service与Protocol层计划.md
- docs/plan/02-Calc层计划.md
- docs/plan/03-Ctrl业务控制层计划.md
- docs/plan/04-Ctrl通用控制层计划.md
- docs/plan/05-Ctrl-IO控制层与Render层计划.md
- docs/plan/06-测试与验收计划.md

门禁：
- 全部未跳过计划文档完成
- 不允许出现 TODO、TBD、待补充、TBC
- 每个计划能追溯到对应设计文档
- 每个计划有可执行步骤、文件范围、测试要求和验收标准
```

## 工具调用

1. `invoke_superpowers` 调用 `superpowers:writing-plans`
2. `read_documentation` 读取 docs/design/**
3. `write_stage_artifact` 写入 7 份计划文档

## 超时

172800 秒（2 天）
