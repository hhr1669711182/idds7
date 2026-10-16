/*
 * @Author: hhr
 * @Date: 2026-04-16 10:44:12
 * @LastEditors: hhr
 * @Description: 控制器 barrel 导出
 * @FilePath: \ids-gis-web\src\controller\index.ts
 */

/**
 * controller/ 只保留 core（业务与通用图形控制）。
 * 原 map/ 与 three/ 的消息订阅 / 发送入口已废弃并删除：
 * - 订阅入口（`@/subscribe`）已随控制层一并下线，业务侧不再从 controller 订阅；
 * - 发送能力保留在 `@/publish`，仅按需 import，不注册到任何控制器。
 */
