# Elasticsearch 聚合集成发布与数据同步方案

> **§0 收敛决策（2026-11-18）：目标态 = 单一 8.x 集群，非双集群。**
> 数据源相近（PG/GeoServer/地址机器人）但客户使用源/方向配置不同——客户差异走**别名 + 角色 + 网关路由**解决，不靠物理双集群；方向配置差异属网络/部署面（白名单、出口 IP、TLS），与集群数无关。全量数据 ~10 万条/30MB，单集群 4C8G 足够。
> 迁移方向铁律：7.x 数据可进 8.x，**不可反向** → 合并落点 = 8.x 侧（167 升配扩容 或 新建 8.x 节点）；198 的 `mapresource`/`api` 单向迁入后退役 198 ES 容器（GeoServer 198:8080 保留）。
> 本方案 §2~§9 按「双集群现状」编写作为过渡态设计；**P2 阶段起的 CDC 双 sink 收敛为单 sink（目标 8.x 集群）**，§8-S1（167 Security）与 §8-S2（198 副本）在收敛后自然消失。
>
> 版本 v1.0 ｜ 2026-11-18 ｜ 编制：ids-gis-web 项目组
> 前置文档：[ES服务功能文档.md](./ES服务功能文档.md)（双节点实测档案，调研样本 `.agnes/work/es-research/`）
> 本文档为**方案级设计稿**，含若干「待确认」项（§10），确认前不落地任何工程改动。

---

## 1. 方案目标

把分散在多个来源的地理/地址数据，统一汇聚到两套 Elasticsearch，并以**可发布、可回滚、可校验**的方式上线：

| 目标 | 说明 |
|------|------|
| 数据汇聚 | PostgreSQL 业务库、GeoServer WFS 图层、地址机器人（Python）后端 三类来源 → ES |
| 变更同步 | PG 表变更经 Flink CDC 近实时写入 ES（秒级~分钟级延迟） |
| 版本发布 | 全量库走「时间戳索引 + 别名切换」原子发布，旧版本可一键回滚 |
| 双集群协同 | 167（8.11.3，地址库）与 198（7.17.22，地图资源）职责分离，互不耦合 |
| 安全对齐 | 167 启用 Security（或防火墙收敛），与 198 的认证模式对齐 |

## 2. 组件角色与现状

| 组件 | 现状（实测/已知） | 本方案中的角色 |
|------|-------------------|----------------|
| **PostgreSQL** | 业务库（GeoServer 底层数据源；`view_juris_zone`/`env_area` 等视图表已在用，北京库 GeoServer 192.168.169.58:8080 同构） | **变更真源**（CDC 上游）；须开启 `wal_level=logical`、建 `replication` 发布账号 |
| **GeoServer（198:8080）** | `gis` 工作空间 WMS/WFS（`view_res_org_dept`、`env_area_fence` 等图层） | **静态要素供给**：WFS 全量/增量导出，写入 198 的 `mapresource` |
| **地址机器人 Python 后端（addressbot）** | 已产出 `addressbot_houduan`（45,183 条）、`addressbot_places_*` 时间戳库（别名 `addressbot_places_current`） | **全量构建方**：地址树（AOI/POI/LOI）全量生成、清洗、打平 ngram 文本，走时间戳发布 |
| **Flink CDC** | 未部署（`src/docs` 无引用） | **增量同步通道**：PG binlog（WAL/逻辑复制）→ 转换 → ES bulk |
| **ES 167（8.11.3）** | 无认证（风险），无分词插件，索引 `addressbot_*` / `shenzhen_address_v1` | **地址库宿主**：全量库 + 别名版本切换 |
| **ES 198（7.17.22）** | Security 启用（elastic/Basic），pinyin/IK 插件，`mapresource` + `api`，yellow（副本 UNASSIGNED） | **地图资源宿主**：WFS 要素 + 热词配置；CDC 增量落点 |

## 3. 总体架构

```
                    ┌──────────────────────────────┐
                    │        PostgreSQL 业务库      │  wal_level=logical
                    │  (队站/辖区/地址/资源 表视图) │  + replication 发布账号
                    └──────┬───────────────────────┘
                           │ Debezium (Flink CDC postgres connector)
                           ▼
          ┌─────────────────────────────────┐
          │         Flink CDC 作业          │  增量快照 + 流式
          │  ① 反压/幂等（按业务主键 upsert）│  checkpoint 秒级~分钟级
          │  ② 路由：按表 → 目标索引/集群   │
          └───────┬────────────────┬─────────┘
                  │ bulk (index/update)│
                  ▼                  ▼
   ┌─────────────────────────┐   ┌───────────────────────────┐
   │ ES 198  mapresource     │   │ ES 167  addressbot_*      │
   │  (7.17.22, pinyin/IK)   │   │ shenzhen_address_v1       │
   │  + api(热词)            │   │ (8.11.3, address_ngram)   │
   └───────────▲─────────────┘   └─────────────▲─────────────┘
               │ WFS 全量/增量导出               │ 全量构建 → 时间戳索引
   ┌───────────┴─────────────┐   ┌──────────────┴─────────────┐
   │ GeoServer (gis 工作空间) │   │ 地址机器人 Python 后端     │
   └─────────────────────────┘   │  清洗/打平/语义词生成       │
                                 └──────────────────────────────┘
      发布方式：时间戳索引 + alias 原子切换（167 已有先例 addressbot_places_current）
```

**职责切分原则（一源一主）**：
- `addressbot_*`（167）：**地址机器人 Python 全量为主**，PG CDC 仅补「增量微调」（如地址更名、删除标记）；全量重建覆盖增量。
- `mapresource`（198）：**GeoServer WFS 全量为基**，PG CDC 补高频变更（队站/资源状态）。
- `shenzhen_address_v1`（167）：独立全量管线（深圳专项），不进 CDC。
- 冲突仲裁：写入带 `version`（PG `update_time` 或 CDC LSN 时间戳）+ 业务主键，**后到且版本更大才覆盖**（ES `update` + `script` 版本比较，避免旧消息覆盖新数据）。

## 4. 数据同步方案（逐链路）

### 4.1 PostgreSQL → Flink CDC → ES

**CDC 作业设计**：

| 项 | 方案 |
|----|------|
| 源连接器 | `flink-cdc-postgres`（Debezium），模式 = 增量快照（`incremental snapshot`），先全量快照后流式，断点续跑靠 checkpoint |
| PG 前置 | `wal_level=logical`；`max_replication_slots` ≥ 作业数；建 `REPLICATION` 角色 + 发布用 publication；PG ≥ 10（建议 12+） |
| 幂等键 | 业务主键映射为 ES `_id`（如 `mapresource` 用 `{type}_{id32}` 规则、地址库用 `record_id`），sink 走 **upsert（index 语义）**，天然可重放 |
| 版本仲裁 | 文档携带 `__src_ts`（PG `update_time` / commit ts）；ES update 脚本：`if (ctx._source.__src_ts >= newTs) update else keep`，防乱序覆盖 |
| 删除同步 | CDC delete → ES `delete`（或软删 `is_deleted=true`，与现有 mapping 一致，**建议软删**，保留审计） |
| 路由 | 按 publication 表 → 目标索引映射表（配置化）；一张 PG 表可扇出多索引（字段投影 + 富化，如拼 `ngram_text`、`semantic_terms`） |
| 目标 | 双 sink：198（`elastic` 账号 Basic 认证）、167（当前匿名，§8 安全对齐后同样走账号） |
| 容错 | checkpoint 间隔 10s、`exactly-once`（两阶段提交，ES sink 支持 bounded out-of-order）；作业失败自动从 checkpoint 恢复，重放幂等无副作用 |

**延迟 SLA（建议）**：常规变更 ≤ 30s 可见；全量快照 ≤ 30min（9,740/45,183 体量下余量充足）。

### 4.2 GeoServer WFS → ES（全量基线）

- 工具链：`wfs2es` 脚本（Python，复用 WFS GetFeature `bbox`/`outputFormat=application/json` 或 GeoJSON）或 GeoServer 侧 `export` + `logstash-es` 直推。
- 节奏：**每日 02:00 全量 + 按需触发**（GeoServer 数据变更后运维手动触发）。
- 写入：bulk index（幂等 `_id`），全量前**不删旧索引**——按 §5 时间戳/别名机制发布新版本，旧版本保留一个发布周期作回滚。
- `geom` 字段：WFS GeoJSON geometry 中心点（centroid）或首个坐标 → `geo_point`（与现有 `mapresource.geom` 口径一致）；`LATITUDE/LONGITUDE`(text) 停止新增（新字段不再写，旧字段保留至重建）。
- 热词库 `api`（198）：业务方直接维护（1 条级体量，不走管线）。

### 4.3 地址机器人 Python 后端 → ES（全量构建）

保持现有机制并规范化（167 已有先例）：

1. 构建产出写**时间戳索引** `addressbot_places_{yyyymmddHHMMSS}`（1 分片 0 副本，`refresh_interval` 构建期置 `-1`、刷新期置 `1s`）。
2. 构建完成后校验（§6）→ 原子别名切换：`POST /_aliases {"actions":[{"remove":{"index":"old","alias":"addressbot_places_current"}},{"add":{"index":"new","alias":"addressbot_places_current"}}]}`（同请求原子执行）。
3. 旧索引保留 7~30 天（或挂 ILM 30-days-default），随后删除。
4. `addressbot_houduan` 同理走时间戳发布，**统一 alias 出口**（现状 houduan 无别名直连，建议补 `addressbot_houduan_current`，下游查询只认别名）。
5. 全量重建与 CDC 增量并发期：CDC 暂停写入目标（sink 切到旧索引或直接停 1~5 分钟窗口），切换完成后 CDC 从 checkpoint 续跑 → 新索引，**保证 CDC 消息不写进即将下线的旧索引**。

### 4.4 发布（Release）Runbook

**索引发布 = 三段式**：

| 步骤 | 动作 | 校验 | 回滚 |
|------|------|------|------|
| ① 建 | 写时间戳新索引 + 灌数 | 文档数 / 校验和 / 抽样 diff（§6） | 删新索引，别名不动 |
| ② 切 | 原子切别名（§4.3 步骤 2） | 别名 `_cat/aliases` 复核；业务冒烟检索 | 反向再切一次别名（秒级） |
| ③ 清 | ILM 到期自动删旧版本 | `_cat/indices` | — |

**CDC 作业发布**：Flink savepoint → 新作业恢复；先停 sink（别名仍指向旧索引）→ 切版完成 → 恢复 sink。

## 5. 一致性校验（每轮发布必做）

| 校验 | 方法 | 阈值 |
|------|------|------|
| 文档数 | `GET {idx}/_count` vs 源（PG `COUNT` / WFS 总数） | 差值 = 已软删数，可解释 |
| 抽样 diff | 按 `_id` 抽样 200 条逐字段比对（脚本 `.agnes/work/es-research/` 已存全量调研样本可复用） | 0 不一致 |
| 关键字段 | `term` 聚合对账（`level`/`type.keyword`/`city_name`）分布对比 | 桶数与文档数一致 |
| 可检索性 | 固定查询集回归（ngram 前缀、拼音 FPY/SPY、geo_bounding_box 半径 1km） | 命中数不变 |
| 集群健康 | `_cluster/health` | 发布后 green（198 单节点下允许 yellow 仅限已知副本 UNASSIGNED，见 §8） |

校验脚本建议落 `scripts/es-sync-verify.mjs`（不进 `src/**`，随管线维护），输出 diff 报告。

## 6. 索引与模板规划（增量落库）

| 索引 | 集群 | 分片/副本 | 发布机制 | ILM |
|------|------|-----------|----------|-----|
| `addressbot_places_{ts}` | 167 | 1/0 | alias `addressbot_places_current` | 30-days-default |
| `addressbot_houduan_{ts}` | 167 | 1/0 | alias `addressbot_houduan_current`（新增） | 30-days-default |
| `shenzhen_address_v1` | 167 | 1/0 | 独立全量，别名化后可同机制 | — |
| `mapresource_{ts}` | 198 | 1/**0**（修正，见 §8） | alias `mapresource_current`（新增） | 30-days-default |
| `api` | 198 | 1/**0**（同上） | 手工维护 | — |
| CDC 增量 | 同集群 | 写当前别名指向索引 | — | — |

> 建议为上述索引建**复合索引模板**（167 用 `addressbot-*`、198 用 `mapresource-*` 前缀），固化分词器与字段类型，杜绝重建时 mapping 漂移（现有 ngram/pinyin 配置即模板化内容）。

## 7. 监控与告警

- **集群**：`_cluster/health` 状态变 red 告警；198 RAM（当前 99%）设 90% 告警线；167 磁盘 76.98% 设 80% 告警。
- **CDC 链路**：Flink 消费延迟（PG LSN 水位差）、sink 错误率、checkpoint 失败次数。
- **同步水位**：ES 侧 `__src_ts` 最大时间 vs 源库 `max(update_time)`，落后 > 5min 告警。
- **Kibana 仪表板**：198 已有 Kibana 7.17.22（`.kibana_7.17.22_001`），167 亦有；各配 1 个同步健康看板（延迟 + 文档数 + 集群状态）。

## 8. 安全与前置整改（发布前必须完成）

| # | 事项 | 动作 | 影响 |
|---|------|------|------|
| S1 | **167 无认证** | 二选一：a) 启用 Security 插件（8.x 需 `elasticsearch-certutil` 重签名重启，窗口 ~5min）；b) 防火墙仅放行白名单网段 + 专用内网账号应用层鉴权 | 阻塞 CDC 直写 167 前的安全验收 |
| S2 | 198 副本 UNASSIGNED（yellow） | 单节点下调 `PUT _settings {"index.number_of_replicas":0}`（`mapresource`/`api` 及其时间戳版本统一经模板设 0） | 转 green，消除假告警 |
| S3 | 198 RAM 99% | 调大容器内存或下调 `ES_HEAP_RATIO`；heap 现 43% 有余量，观察 OOM 曲线 | 决定 CDC 并发数 |
| S4 | PG 逻辑复制前置 | `wal_level=logical`、replication slot 上限、专用发布账号（最小权限：仅 SELECT + REPLICATION） | 阻塞 CDC 部署 |
| S5 | 凭证管理 | ES 账号入密钥管理（不入库明文）；198 的 `elastic` 账号按管线拆**只读/读写分离角色**（检索只读、CDC 写权限） | 审计合规 |

## 9. 实施路线

| 阶段 | 内容 | 出口标准 |
|------|------|----------|
| P0（前置） | S1~S4 整改 | 167 认证可用 / 198 green / PG 逻辑复制就绪 |
| P1（基线） | 全量管线：WFS→mapresource、Python→addressbot 时间戳发布 + 别名机制补全（houduan/mapresource 建别名）+ 复合索引模板 | 一轮完整发布 + 回滚演练通过（§4.4） |
| P2（增量） | Flink CDC 部署：checkpoint、双 sink、版本仲裁、软删 | 模拟 CDC 延迟 ≤30s；杀作业重放幂等验证 |
| P3（闭环） | 监控告警 + 发布 runbook 演练 + 校验脚本常态化（每轮发布自动跑 §5） | 无值守跑 72h，0 数据不一致 |

## 10. 待确认项（需项目组/运维答复）

1. **PG 库**：CDC 上游是哪套库（192.168.169.58 北京库同构？还是深圳专属库）？具体同步表清单与主键列（`view_*` 视图不能直接 CDC，需定位到底层实体表）。
2. **Flink 集群**：是否已有 Flink 部署（K8s/裸进程）？没有则 P2 需含部署工作量。
3. **GeoServer 数据流**：`gis` 工作空间底库是 PG 还是 Shapefile/PostGIS？若是 PostGIS 且与 CDC 库同源，WFS 全量可并入 CDC 全量快照，链路减一。
4. **地址机器人后端**：构建任务调度方（Cron/人工触发）？是否已具备时间戳索引 + 别名切换能力（现状仅 places 有，houduan 未走）？
5. **发布窗口**：别名切换是否需避开值班高峰（秒级切换本身无感知，主要风险在 CDC 暂停窗口）。
6. **167 Security 整改**（S1）走插件启用还是网络白名单？（涉及 8.x 容器重启窗口审批）

## 附：与前端（ids-gis-web）的边界

- 前端**不直连 ES**，地址检索继续走 `ids-address-query-client` 代理（`VITE_MAP_PROXY_API`）；本方案所有发布动作对前端透明（查询只认别名）。
- 若后续新增检索类消息事件，须同步 `docs/source/07-协议事件清单.md` 与协议层 DTO Schema（本方案不动协议）。
