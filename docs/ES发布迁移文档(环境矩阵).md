# Elasticsearch 多环境发布与迁移文档（dev / test / uat / pro）

> **§0 收敛决策（2026-11-18）：pro 目标态 = 单一 8.x 集群。** 本文 §1 矩阵中 pro 列「双实例现状」为过渡态；§6「版本升级路线」的目标终点由「198 升 8.11 双集群并存」改为「**198 数据单向迁入 8.x 主集群 → 198 ES 容器退役（GeoServer 保留）**」。test/uat/dev 一律直接按**单 8.x 集群**部署，不再克隆双版本。
>
> 版本 v1.0 ｜ 2026-11-18 ｜ 配套：[ES服务功能文档.md](./ES服务功能文档.md)、[ES集成发布与数据同步方案.md](./ES集成发布与数据同步方案.md)
> 本文档覆盖：各环境 ES 的 **Docker 部署规格、镜像与参数配置、索引/别名/认证差异、发布迁移步骤**。
> 现状基准（实测）：pro 双节点 `192.168.173.167:9200`（8.11.3，`docker-cluster`，匿名）、`192.168.173.198:9200`（7.17.22，`es-single-node`，Security 启用）。

---

## 1. 环境矩阵总览

| 项 | dev | test | uat | pro |
|----|-----|------|-----|-----|
| 部署形态 | Docker 单机（开发机/内网虚机） | Docker 单机 | Docker 单机 | Docker 单机 ×2（双实例，**过渡态**；目标态收敛为单 8.x 集群，见 §0/§6） |
| 建议镜像 | `docker.elastic.co/elasticsearch/elasticsearch:8.11.3` | 同左 | 同左 | **保持现状双版本**：167=`elasticsearch:8.11.3`、198=`elasticsearch:7.17.22`（见 §7 升级待办） |
| 集群名 | `es-dev` | `es-test` | `es-uat` | `docker-cluster`(167) / `es-single-node`(198) |
| License | basic | basic | basic | basic |
| Security | **禁用**（`xpack.security.enabled=false`，仅内网 + .env 白名单） | 禁用 | **启用**（Basic，`elastic` + 强密码） | 启用（与 uat 对齐；**167 需补启用**，见 §5-S1） |
| 分词插件 | 无（ngram 内置） | 无 | analysis-pinyin + analysis-ik（对应 8.11.3 插件版） | 198 有 pinyin/ik 7.17.22；167 无（靠自定 ngram） |
| 数据规模 | 抽样 5%（约 2,500 条） | 全量 | 全量 | 全量 |
| 分片/副本 | 1/0 | 1/0 | 1/0 | 1/0（模板统一 0 副本） |
| 别名 | 同 pro 全套（`addressbot_places_current` / `addressbot_houduan_current` / `mapresource_current`） | 同左 | 同左 | 同左 |
| 数据灌入 | pro 抽样导出（`_search` + `search_after`）或 CDC dry-run | pro 全量导出 → bulk 导入 | 同 test | 源侧（PG/GeoServer/Python）直接写 |

> 原则：**test/uat 是 pro 的镜像克隆**（索引结构、别名、分词器 1:1），差异仅在数据量与认证策略。

## 2. Docker 部署配置（dev/test/uat 通用）

### 2.1 容器参数基线

```yaml
# docker-compose.yml（dev/test/uat 单机；端口按环境改 9200/9201）
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.3
    container_name: es-${ENV}          # es-dev / es-test / es-uat
    environment:
      - cluster.name=es-${ENV}
      - discovery.type=single-node          # 单机禁用发现，防假集群
      - xpack.security.enabled=false         # dev/test；uat 改 true 并启用 TLS 证书
      - ES_JAVA_OPTS=-Xms512m -Xmx512m      # 开发机 2G / test 4G / uat 与 pro 对齐 8G
      - "http.host=0.0.0.0"
    ports:
      - "9200:9200"
    volumes:
      - es-${ENV}-data:/usr/share/elasticsearch/data
      - ./plugins:/usr/share/elasticsearch/plugins   # pinyin/ik（uat 起启用）
    healthcheck:
      test: ["CMD-SHELL", "curl -fs http://localhost:9200/_cluster/health | grep -v red"]
      interval: 30s
      retries: 5
    restart: unless-stopped
volumes:
  es-${ENV}-data:
```

### 2.2 服务器镜像配置（宿主机/容器规格）

| 环境 | CPU | 内存 | 磁盘（数据卷） | JVM 堆 | 备注 |
|------|-----|------|----------------|--------|------|
| dev | 2C | 4G | 20G | 512m | 抽样数据，够用 |
| test | 4C | 8G | 50G | 2g | 全量数据（pro 约 30MB 体量，50G 留日志/快照余量） |
| uat | 4C | 8G | 50G | 2g | 与 test 同规格，数据独立 |
| pro-167 | 现状 | 现状 | 磁盘已用 76.98%（**需扩容或清 ILM**） | 现状 | 观察 |
| pro-198 | 现状 | RAM 使用 99%（**需扩内存或降堆占比**） | 51.97% | 现状 | 观察 |

镜像构建约定：
- 基础镜像锁 **digest**（`docker.elastic.co/...:8.11.3@sha256:...`）进 `docker-compose`，防 tag 漂移。
- 分词插件用官方 `elasticsearch-plugin install file://analysis-pinyin-8.11.3.zip` 在镜像构建阶段安装（`Dockerfile` 分层），不挂宿主机目录。
- 容器时区 `TZ=Asia/Shanghai`（`updated_time` 展示与 ILM 删除时点对齐）。

## 3. 索引初始化（环境克隆）

每个新环境初始化 = 三段（幂等脚本，建议 `scripts/es-env-init.mjs`）：

```
① 建复合模板（固化分词器/字段，防重建漂移）
   PUT /_index_template/addressbot
   PUT /_index_template/mapresource
   （模板内容 = 现有 index settings 抽出的分词器段 + mapping 段）
② 灌数据
   pro 导出：_search + search_after 全量拉 → NDJSON
   目标导入：_bulk（dev 抽样 5%；test/uat 全量）
③ 建别名
   POST /_aliases  （addressbot_places_current 等全套）
```

dev 抽样导出命令（pro 侧）：
```
GET /addressbot_places_20260805014830/_search
  ?size=100&search_after=["last_sort_value"]  # 循环至空；45k 体量 <1min
```

## 4. 认证与网络策略（按环境）

| 环境 | 认证 | 网络 |
|------|------|------|
| dev | 无 Security；`.env.development` 记 `VITE_MAP_PROXY_API` 指向 dev 代理 | 仅开发网段 |
| test | 无 Security；测试网关 IP 白名单 | 测试网段 |
| uat | Security 启用：`elastic` 超管 + `es-sync-writer`（写角色）+ `es-reader`（只读角色）；密码进密钥管理，**不落文档/代码** | UAT 网段 + CDC 作业出口 IP |
| pro | uat 同款三角色；**167 补启用 Security 后** 167/198 账号体系对齐 | 生产网段 |

8.x 启用 Security 一次性动作（pro-167 整改，~5min 窗口）：
```
docker exec es-pro-167 bin/elasticsearch-certutil http --out config/certs/http_ca.crt
bin/elasticsearch-certutil ca --out config/certs/ca.zip
→ 挂载 certs 目录 + xpack.security.http.ssl 配置 → 重启容器
```

## 5. 发布迁移 Runbook

### 5.1 新环境从零拉起（dev/test/uat）

| 步 | 动作 | 出口校验 |
|----|------|----------|
| 1 | 服务器配规格（§2.2）+ 拉锁定镜像 + 装插件 | `docker images` digest 一致 |
| 2 | 起容器 | `_cluster/health` = green |
| 3 | 跑 `es-env-init.mjs`（§3 三段） | 别名齐、文档数 = 预期（dev≈2500/test=全量） |
| 4 | 认证配置（§4） | uat：curl -u 通过；dev/test：匿名通过 |
| 5 | 冒烟：固定查询集（ngram 前缀 / 拼音 FPY / geo_bounding_box） | 命中数与 pro 抽样基线一致 |
| 6 | 接前端代理（`ids-address-query-client` 各环境实例指向本环境 ES） | 页面地址检索正常 |

回滚：新环境独立可弃，删容器卷即回退；**不影响 pro**。

### 5.2 pro 侧索引版本发布（沿用别名机制）

```
① 建 addressbot_places_{ts} 新索引（模板自动套用分词器）→ 灌数 → 校验（§方案文档 §5 五校验）
② 原子切别名
   POST /_aliases  {"actions":[
     {"remove":{"index":"addressbot_places_{old}","alias":"addressbot_places_current"}},
     {"add":{"index":"addressbot_places_{new}","alias":"addressbot_places_current"}}]}
③ 旧索引挂 ILM 30-days-default，到期自动清
回滚 = ②反向再切一次（秒级，业务无感）
```

### 5.3 环境间数据迁移（pro → test/uat 定期刷新）

| 通道 | 适用 | 说明 |
|------|------|------|
| `_search + search_after` 导出 → `_bulk` 导入 | dev/test/uat 全量刷新 | 45k/9.7k 体量 <5min；脚本化定时（如 uat 每周一） |
| `_reindex`（remote） | 两 ES 互搬 | 需被搬侧 `reindex.remote.whitelist`；跨版本 7→8 不支持 reindex，走「8.x 侧读 7.x 远端」单向可行 |
| 快照恢复 | 同版本跨集群 | 双方建共享仓库（NFS/MinIO）；**8.11 快照不能恢复进 7.17**（版本不可逆） |

> ⚠️ 版本方向铁律：7.x 数据可进 8.x；**8.x 数据不能 reindex/快照进 7.x**。198（7.17）升级 8.x 前（§7）只能做「198 侧导出 → 目标 8.x 导入」。

## 6. 版本升级路线（pro 双集群 → 单一 8.x 集群收敛）

现状 167=8.11.3、198=7.17.22，**目标态 = 单一 8.x 集群**（§0 决策）：198 数据单向迁入 8.x 侧，198 ES 容器退役（GeoServer 198:8080 保留）：

| 步 | 动作 | 风险 |
|----|------|------|
| 1 | 定目标集群：167 升配（磁盘 76.98% / Security 未启用）或新建 8.x 节点（装 pinyin/ik 8.11.3 插件）；`_reindex remote` 或 `search_after` 导出 → 导入 198 的 `mapresource`/`api`（9,740 条 <1min），7.x 遗留 `_type` 字段 8.x 忽略无损 | 窗口审批；回滚 = 198 保持只读不退役 |
| 2 | 导入后跑 §5.2 同套校验 + 固定查询集回归 → 代理/网关路由切到目标集群 → 198 只读观察 7 天 | 切路由前 198 写入方（CDC/Gateway）先停 |
| 3 | 167（或目标节点）启用 Security（§4），三角色收敛 | 5min 窗口 |
| 4 | 198 ES 容器下线；`max_result_window=1000000` 等特配随迁移写入目标集群模板 | 旧容器数据卷保留 7 天再清 |

## 7. 配置差异速查（避免环境漂移）

| 配置项 | dev/test | uat | pro-167 | pro-198 |
|--------|----------|-----|---------|---------|
| `number_of_replicas` | 0 | 0 | 0 | **0**（现状 1 改 0，消除 yellow） |
| `max_result_window` | 10000 | 10000 | 默认 10000 | 1000000（保持，深翻页业务） |
| `refresh_interval` | 1s | 1s | 1s | 1s（构建期临时 `-1`） |
| 分词插件 | 无 | pinyin/ik | 无（ngram 内置） | pinyin/ik |
| `routing.allocation.include._tier_preference` | `data_content`（8.x 模板默认） | 同 | 同 | 同（7.x 遗留，升级后清除） |
| ILM | 30-days-default（places/houduan/mapresource 时间戳库） | 同 | 同 | 同 |

## 8. 验收清单（每个环境上线前逐项打勾）

- [ ] `_cluster/health` 状态符合预期（dev/test/uat=green；pro-198 允许 yellow 仅副本项，改 0 副本后 green）
- [ ] 别名全套存在：`addressbot_places_current` / `addressbot_houduan_current` / `mapresource_current`
- [ ] 固定查询集回归通过（ngram / 拼音 / geo / terms 聚合分布）
- [ ] uat/pro：Security 三角色（writer/reader/super）可用，密码在密钥管理而非文档
- [ ] CDC 出口（P2 阶段）：dev/test 可 dry-run 写入验证幂等
- [ ] 镜像 digest 锁定记录在案；宿主机磁盘/内存余量 ≥ 40%
- [ ] 回滚演练：别名反切 < 10s 完成且检索正常
