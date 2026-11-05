# control-baseline —— 旧 Control 归一基准快照（fixture）

`src/Control/` 已按用户授权（P3 提前解锁，2026-11-05）删除。本目录保存删除前 5 个归一基准模块
+ 其依赖 `seatSharedState`，作为 `tests/unit/messageNormalizationParity.spec.ts` 与
`tests/unit/alarmProfileMigration.spec.ts` 的"旧链基准"，用于 A/B 回放对比新链
`@/interceptor/transforms/*` 的归一等价性。

- 快照来源：`src/Control/**` @ commit `6fe1b18`，逐字节拷贝，仅修正 1 处 `@/Control/seatSharedState`
  导入为 `./seatSharedState`（同目录相对化）。
- 只读基准：修改这些文件会改变旧链基准语义，除非有意重放新版"旧行为"，否则禁止改动。
- 依赖：仅 `@/const/const.message.type`（存留于 src），无 store/运行时依赖。
- 后续 36 项人工验收全部通过后，可评估将 parity 测试改为固定期望值并删除本目录（见桌面文档
  《Control迁移人工验收清单36项.md》门禁结论）。
