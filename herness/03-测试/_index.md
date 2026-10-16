# 03-测试

> 测试策略、用例、报告。自动化 runner 已落地（Vitest + Playwright），详见 [_流程规范.md](_流程规范.md)。
> **测试侧的完整契约（四要素 + GIS 专用契约 + 覆盖率策略）在 `tests/harness/README.md`**，改测试前先读那份。

## 文档列表

| 文档 | 说明 | 状态 |
|------|------|------|
| [_流程规范.md](_流程规范.md) | 测试工作流与门禁 | 规范 |
| [测试用例/编写规范.md](测试用例/编写规范.md) | 用例编写规范与模板 | 规范 |
| [测试报告/编写规范.md](测试报告/编写规范.md) | 报告编写规范与模板 | 规范 |
| [测试报告/Control走线迁移-P1自动化回归报告.md](测试报告/Control走线迁移-P1自动化回归报告.md) | P1实现、916固定输入回放、全量回归及验证边界 | 自动化通过，人工待验收 |
| 测试策略.md | 项目级测试策略 | 待补充 |

## 测试资产

| 路径 | 说明 | 备注 |
|------|------|------|
| `tests/harness/README.md` | **测试契约真相源**：四要素 + GIS 专用契约 + 覆盖率策略 | 规范 |
| `tests/harness/setup.ts` | 全局 setup（ResizeObserver / matchMedia / mock 清理） | 代码 |
| `tests/unit/**/*.spec.ts` | 单元 + 集成测试，数量以 runner 实测为准 | 代码 |
| `tests/components/**/*.spec.ts` | 组件测试（jsdom + @vue/test-utils） | 代码 |
| `tests/e2e/**/*.spec.ts` | E2E 冒烟（Playwright） | 代码 |
| `tests/fixtures/**` | 可复用测试数据 | 代码 |
| `tests/__artifacts__/**` | 覆盖率 / trace / 报告产物 | 已 gitignore |
| `tests/*.test.ts` | 历史遗留脚本（9 个，已转写为 `tests/unit/*.spec.ts`） | ⚠️ 待删除 |

## 自动化命令

```bash
pnpm test              # 单元 + 组件（当前结果见测试报告）
pnpm test:coverage     # 覆盖率（产物在 tests/__artifacts__/coverage）
pnpm test:ui           # Vitest UI
pnpm e2e               # Playwright 冒烟（独立拉起 dev server）
pnpm lint:baseline     # 与基线 diff，输出新增项
```
