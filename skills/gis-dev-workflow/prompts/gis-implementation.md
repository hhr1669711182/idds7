# gis-implementation Prompt

> 阶段 4：实现
> 调用入口：`$gis-dev-workflow:gis-implementation`
> 前置技能：`superpowers:test-driven-development`、`superpowers:subagent-driven-development`

---

## 触发条件

- 六份计划文档完成且无 TODO/TBD/待补充。

## 提示词模板

```text
使用 $gis-dev-workflow:gis-implementation 根据已审阅的计划完成代码与测试。

前置：
1. 调用 superpowers:test-driven-development
2. 调用 superpowers:subagent-driven-development（如需多文件并行）
3. 读取 docs/plan/** 七份文档

执行步骤（按五层 + 集成顺序）：
1. Service → Protocol → Calc → Ctrl → Render
2. 任何实现步骤先有失败测试，再写生产代码
3. 高频数据（GPS ≥ 2fps、轨迹）走 Worker + Transferable Objects
4. 业务控制层方法可注入 genericController mock
5. 通用控制层方法可注入 store mock
6. 业务控制层方法以"业务动词 + 业务名词"命名
7. 业务 ID 必须加业务前缀
8. Auto-Fit 必须带 10-15% Padding
9. 协议层 DTO 严格遵守 协议层DTO Schema.tsd

质量门禁（必须全部通过）：
- pnpm type-check
- pnpm lint
- pnpm test（覆盖率 ≥ 80%）

架构合规：
- 业务控制层禁止直接调 OpenLayers / ThreeJS
- 通用控制层禁止读业务 store
- 业务 ID 必须加业务前缀
- Auto-Fit Padding 必须保留 10-15%
```

## 工具调用

1. `invoke_superpowers` 调用 TDD / subagent
2. `read_documentation` 读取 docs/plan/**
3. `write_stage_artifact` 写入 src/** 与 tests/**
4. `run_quality_gate` 执行 type-check / lint / test

## 超时

864000 秒（10 天）
