# Prompts Index

> gis-dev-workflow 各阶段提示词模板（Hermes Agent 兼容）

## 阶段提示词

| 阶段 | 提示词文件 | 入口命令 | superpowers 技能 |
| ---- | ---------- | -------- | ---------------- |
| 1 分析 | [gis-analysis.md](gis-analysis.md) | `$gis-dev-workflow:gis-analysis` | — |
| 2 设计 | [gis-design.md](gis-design.md) | `$gis-dev-workflow:gis-design` | `superpowers:brainstorming` |
| 3 计划 | [gis-planning.md](gis-planning.md) | `$gis-dev-workflow:gis-planning` | `superpowers:writing-plans` |
| 4 实现 | [gis-implementation.md](gis-implementation.md) | `$gis-dev-workflow:gis-implementation` | `superpowers:test-driven-development` + `superpowers:subagent-driven-development` |
| 5 测试 | [gis-test.md](gis-test.md) | `$gis-dev-workflow:gis-test` | `superpowers:verification-before-completion` + `superpowers:requesting-code-review` |
| 交接 | [handover-doc.md](handover-doc.md) | `$gis-dev-workflow:handover-doc` | — |

## 使用方法

### Codex / Hermes / Claude Code

```text
使用 $gis-dev-workflow:gis-analysis 分析 docs/source/ 下的资料。
```

### Trae / Cursor

```text
@$gis-dev-workflow:gis-design 请基于 docs/analysis/01-五层索引目录.md 完成五层架构设计。
```

### OpenAI Agents SDK

```python
agent.run(
    skill="$gis-dev-workflow:gis-test",
    context={"repository_root": "d:/work/telewave/ids/ids-gis-web"}
)
```
