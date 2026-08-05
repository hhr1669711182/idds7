# gis-test Prompt

> 阶段 5：测试
> 调用入口：`$gis-dev-workflow:gis-test`
> 前置技能：`superpowers:verification-before-completion`、`superpowers:requesting-code-review`

---

## 触发条件

- 全部未跳过计划已实现。

## 提示词模板

```text
使用 $gis-dev-workflow:gis-test 验证当前实现并生成验收证据。

前置：
1. 调用 superpowers:verification-before-completion
2. 调用 superpowers:requesting-code-review

执行步骤：
1. 运行质量门禁：
   - pnpm type-check
   - pnpm lint
   - pnpm test（覆盖率 ≥ 80%）
   - pnpm bench（性能基准）
   - pnpm build
2. 用 Playwright + Headless Chrome 跑 5 个核心场景端到端测试：
   - 值守（duty）
   - 来电弹屏（incoming-call）
   - 问询研判（inquiry）
   - 图上调派（dispatch）
   - 跟踪到场（tracking）
3. 收集性能数据到 tests/perf/report.json
4. 对照 docs/source/10-前端实现完整度评分规则.md 计算综合得分
5. 生成 tests/report/final-acceptance.md

门禁：
- 覆盖率 ≥ 80%
- 5 个核心场景 AC 全部通过
- 性能 SLA 全部达标：
  - 帧率 ≥ 30fps（P95）
  - 来电弹屏 ≤ 500ms
  - 调派算路 ≤ 1s（P95）
- 综合评分 ≥ 80 分（B 良好及以上）
- 缺陷修复都有回归测试
- 静态检查全部通过
- 状态机合法/非法转移全部测试通过
- 严禁事项清单无违反
- WGS84 责任分工无违反
- 业务/通用 DTO 严格分离
```

## 工具调用

1. `invoke_superpowers` 调用 verification / code-review
2. `run_quality_gate` 执行 type-check / lint / test / bench / build
3. `write_stage_artifact` 写入 final-acceptance.md

## 超时

172800 秒（2 天）
