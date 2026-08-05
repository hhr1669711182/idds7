# gis-analysis Prompt

> 阶段 1：分析
> 调用入口：`$gis-dev-workflow:gis-analysis`
> 适用文档集：`docs/source/**` + `mds/**`

---

## 触发条件

- 新增 GIS 业务场景。
- 重构现有 controller / store / composable。
- 把已有 `mds/**` 设计落到代码与测试。

## 提示词模板

```text
使用 $gis-dev-workflow:gis-analysis 分析以下资料：
- 仓库根：d:/work/telewave/ids/ids-gis-web
- 业务文档集：docs/source/**（15 份，详见 00-文档集索引与前言.md）
- 历史资料：mds/minmax_output/**（保留作为参考）

输出：
- docs/analysis/01-五层索引目录.md（按五层 Service/Protocol/Calc/Ctrl/Render 强/中/弱/不相关四档分析）

门禁：
- 路径正确性（必须 docs/analysis/01-五层索引目录.md）
- 章节完整性（无空章节）
- 必须经用户审阅
```

## 前置必读

- `docs/source/00-文档集索引与前言.md`
- `references/workflow-contract.md`
- `references/gis-architecture.md`

## 工具调用

1. `read_documentation` 读取所有资料
2. `write_stage_artifact` 写入 `docs/analysis/01-五层索引目录.md`

## 超时

7200 秒（2 小时）
