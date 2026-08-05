# handover-doc Prompt

> 配套技能：项目交接
> 调用入口：`$gis-dev-workflow:handover-doc`
> 任何阶段后均可调用

---

## 触发条件

- 需要为新人 / SRE / DevOps / 架构评审生成项目交接文档。

## 提示词模板

```text
使用 $gis-dev-workflow:handover-doc 生成项目交接文档。

输入：
- 仓库根：d:/work/telewave/ids/ids-gis-web
- 文档集：docs/source/**（15 份）
- 历史资料：mds/**
- 控制器：src/controller/**
- 测试：tests/**
- 规约：references/**

执行步骤：
1. 读取 references/handover-template.md 模板
2. 收集仓库事实：
   - README.md
   - package.json
   - mds/** 关键资料
   - docs/source/** 全部文档
   - src/controller/** 控制器清单
   - tests/** 测试覆盖
3. 按模板生成 docs/handover/<project-name>-交接文档.md
4. 敏感信息脱敏或标"待确认"
5. 用户完成审阅

门禁：
- 路径：docs/handover/<project-name>-交接文档.md
- 敏感信息已脱敏
- 用户完成审阅
```

## 工具调用

1. `read_documentation` 读取模板与仓库事实
2. `write_stage_artifact` 写入交接文档

## 超时

无固定超时（按仓库规模自适应）
