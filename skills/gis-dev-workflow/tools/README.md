# Tools Index

> gis-dev-workflow 工具集（OpenAI Agents / Hermes Agent 兼容）

## 工具清单

| 工具 ID | 适用阶段 | 用途 |
| ------- | -------- | ---- |
| [read_documentation.json](read_documentation.json) | 全阶段 | 读取 docs/source/** 与 mds/** 文档 |
| [write_stage_artifact.json](write_stage_artifact.json) | 全阶段 | 按阶段路径写入产物 |
| [run_quality_gate.json](run_quality_gate.json) | 实现 / 测试 | 运行 pnpm type-check / lint / test / bench / build |
| [invoke_superpowers.json](invoke_superpowers.json) | 设计 / 计划 / 实现 / 测试 | 调用 superpowers 配套技能 |

## 工具调用规范

### 1. read_documentation

读取业务文档集或历史资料库。

```json
{
  "path": "docs/source/05-五层架构领域模型设计.md",
  "purpose": "design"
}
```

### 2. write_stage_artifact

按阶段路径写入产物（强制路径校验 + 禁用关键词校验）。

```json
{
  "stage": "gis-design",
  "path": "docs/design/01-业务域设计.md",
  "content": "# 业务域设计\n..."
}
```

### 3. run_quality_gate

执行工程质量门禁命令。

```json
{
  "commands": ["type-check", "lint", "test"],
  "fail_fast": true,
  "coverage_threshold": 80
}
```

### 4. invoke_superpowers

调用 superpowers 配套技能。

```json
{
  "skill": "superpowers:test-driven-development",
  "context": {
    "current_stage": "gis-implementation",
    "artifacts": ["src/controller/alarm/AlarmCtrl.ts"]
  }
}
```

## 权限矩阵

| 工具 | file:read | file:write | shell:execute | skill:invoke |
| ---- | --------- | ---------- | ------------- | ------------ |
| read_documentation | ✅ | — | — | — |
| write_stage_artifact | — | ✅ | — | — |
| run_quality_gate | — | — | ✅ | — |
| invoke_superpowers | — | — | — | ✅ |

## 版本

- 工具集版本：1.0.0
- 与 manifest.json 同步
