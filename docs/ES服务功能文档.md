# 地址服务 Elasticsearch 双节点功能文档

> **§0 收敛决策（2026-11-18 补充）**：本文记录**现状双集群**（167=8.11.3 / 198=7.17.22）。**目标态为单一 8.x 集群**（详见《ES集成发布与数据同步方案.md》§0 与 §2、《ES发布迁移文档(环境矩阵).md》§1/§6）：198 的 `mapresource`/`api` 单向迁入 8.x 目标集群，198 ES 容器退役、GeoServer（198:8080）保留。167 现状无 Security、198 现状 7.x 副本 UNASSIGNED/RAM 99%，均非目标态。
>
> 调研时间：2026-11-18 ｜ 调研方式：REST API 实测（curl）
> 涉及服务：
> - **节点 A**：`192.168.173.167:9200`（地址库 addressbot / 深圳地址）
> - **节点 B**：`192.168.173.198:9200`（地图资源 mapresource / 检索配置 api；同机还部署 GeoServer `http://192.168.173.198:8080/geoserver/`）

两台是**相互独立的两套 ES 实例**（不同集群名、不同版本、无跨节点集群关系），共同支撑地址/POI 检索类业务。

---

## 1. 集群对比总览

| 项目 | 节点 A（192.168.173.167） | 节点 B（192.168.173.198） |
|------|---------------------------|---------------------------|
| 集群名 | `docker-cluster`（uuid `mFgs5oBQRveGH0o44q4mYg`） | `es-single-node`（uuid `Uy3qfnneTHqdgMejkflH7w`） |
| 版本 | 8.11.3（docker 部署，Lucene 9.8） | 7.17.22（docker 部署，Lucene 8.11.3） |
| 节点数 | 1（单节点） | 1（单节点） |
| 健康状态 | **green**（8 主分片，0 副本） | **yellow**（`mapresource`/`api` 各配 1 副本，单节点导致副本 UNASSIGNED，不影响读写） |
| License | basic（2026-08-05 签发） | basic（2026-05-20 签发） |
| 认证 | 无（Security 未启用，匿名 HTTP 200 可访问） | 启用 Security 插件（`.security-7` 索引），Basic 认证，用户 `elastic` |
| 自定义分词插件 | 无（使用内置 ngram） | `analysis-ik 7.17.22`、`analysis-pinyin 7.17.22` |
| 内存/磁盘 | heap 51%、RAM 78%、磁盘 76.98% | heap 43%、RAM 99%、磁盘 51.97%（磁盘使用偏高需关注） |
| 持久化集群设置 | 无（persistent/transient 均为空） | 无（persistent/transient 均为空） |

### 快照 / 数据流
- 节点 A：`_snapshot/_all` 为空，`_data_stream` 为空。
- 节点 B：无快照仓库；`kibana-event-log-policy` ILM 管理 `.kibana-event-log-7.17.22-000004~07`（别名 `.kibana-event-log-7.17.22`，写别名指向 `000007`）。

---

## 2. 业务索引明细

### 2.1 节点 A（167）

| 索引 | 文档数 | 大小 | 分片/副本 | 说明 |
|------|--------|------|-----------|------|
| `addressbot_houduan` | 45,183 | 11.5mb | 1/0 | 后端地址全量库（AOI/POI/LOI 分级） |
| `addressbot_places_20260805014830` | 45,183 | 10.6mb | 1/0 | 地址库带时间戳快照版，别名 `addressbot_places_current` 指向它（可滚动切换版本） |
| `shenzhen_address_v1` | 8,109 | 5.7mb | 1/0 | 深圳地址结构化库（镇/路/AOI/楼栋 + 拼音分词） |

业务别名：
- `addressbot_places_current` → `addressbot_places_20260805014830`（读别名，版本切换用；无 filter / 无 routing）
- 其余为 Kibana 系统别名（`.kibana`、`.kibana_task_manager`）。

**addressbot_houduan 数据分布**（`level` 聚合，实测）：

| level | 文档数 | 含义 |
|-------|--------|------|
| AOI_1 | 42,494 | 一级 AOI（国家/省/市/区行政区划） |
| POI_3 | 2,204 | 三级 POI（门牌等末端点位） |
| LOI | 217 | 线性兴趣面（道路等） |
| POI_1 | 152 | 一级 POI（当前为深圳市，city_name=深圳市 152 条） |
| AOI_2 | 78 | 二级 AOI |
| AOI_3 | 38 | 三级 AOI（园区/楼宇面，如「国人通信大厦」） |

`record_id` 结构：`{LEVEL}:{admin_code或hash}`，如 `AOI1:1`（中国）、`AOI1:440305`（南山区）、`AOI3:9a76...`。`parent_id` + `parent_path_ids` 构成 AOI 层级树（`AOI1:1` → `AOI1:440000` → `AOI1:440300` → `AOI1:440305` → 下级）。

**分词配置**（索引级 settings，167 两个 addressbot 索引一致）：
- `address_ngram` 分析器 = ngram tokenizer（min_gram=1，max_gram=3，token_chars=letter+digit）+ lowercase；`normalized_name`/`normalized_aliases`/`ngram_text` 用该分析器索引、`standard` 分析搜索 → 前缀/子串模糊召回。
- 三个索引均 `number_of_shards=1、number_of_replicas=0`，`refresh_interval=1s`（addressbot 两个），`routing.allocation.include._tier_preference=data_content`。

#### 字段结构（addressbot_houduan / places，mapping `dynamic:false`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `record_id` / `parent_id` / `parent_path_ids` | keyword | 记录主键、父级、路径 |
| `name` / `normalized_name` | text(standard 搜) + keyword 子字段 | 名称及归一化名称 |
| `aliases` / `normalized_aliases` | text + keyword 子字段 | 别名（如「办公楼宇」） |
| `level` | keyword | AOI_1~3 / POI_1~3 / LOI |
| `admin_code` / `area_code` / `city_name` / `county_name` / `street_name` / `address_name` / `short_name` | keyword / text+keyword | 行政区划与地址要素 |
| `aoi_id` / `aoi_name` / `aoi_type_code` / `aoi_type_name` / `poi_type_code` / `poi_type_path` | keyword | AOI/POI 类型编码与路径（如 `0803000000`「文教办公,写字楼办公」） |
| `building_id` / `building_name` / `building_facilitie` / `building_periph` / `building_special` | keyword / text / object(dynamic) | 楼栋属性，`building_special` 含 met_* 几何度量（高度、楼层、面宽、近邻方位距离等 float/long） |
| `location` | geo_point | `{lon,lat}` 中心点 |
| `latitude` / `longitude` | double | 经纬度数值 |
| `coord_sys` | keyword | 坐标系标识 |
| `semantic_terms` | text | 语义同义词（「写字楼,办公楼,商务楼…」） |
| `houduan_search_text` | text | 后端拼装的检索文本 |
| `ngram_text` / `normalized_aliases` / `normalized_name` | text(address_ngram) | ngram 召回字段 |
| `poi_1` | object(dynamic) | 一级 POI 明细快照（geom/geom_wkt、经纬度、审计字段、captured_at、data_source 等） |
| `is_deleted` / `updated_time` / `height_over_100m` / `special_present` | boolean / date | 状态与标记 |

**样例数据（实测）**：
```json
// AOI_3（园区/楼宇面）
{"record_id":"AOI3:9a761e6d…","name":"国人通信大厦","normalized_name":"国人通信大厦",
 "aliases":["办公楼宇"],"level":"AOI_3","parent_id":"AOI1:440305",
 "parent_path_ids":["AOI1:1","AOI1:440000","AOI1:440300","AOI1:440305"],
 "admin_code":"440305","aoi_type_code":"160000","aoi_type_name":"产业办公",
 "semantic_terms":"产业办公","ngram_text":"国人通信大厦 办公楼宇 产业办公 产业办公",
 "updated_time":"2026-06-25T16:28:10.510000","is_deleted":false,
 "location":{"lon":113.93616221,"lat":22.54648533}}

// POI_3（门牌末端点位，带 poi_type）
{"record_id":"POI3:0DBE402A…","name":"高新中四道9号","level":"POI_3","admin_code":"440305",
 "poi_type_code":"0803000000","poi_type_path":"文教办公,写字楼办公",
 "semantic_terms":"写字楼,办公楼,商务楼,办公室,大厦,办公区",
 "location":{"lon":113.9385834,"lat":22.54578111}}
```

#### shenzhen_address_v1 字段（mapping 动态）

| 字段 | 类型 | 说明 |
|------|------|------|
| `aoi` / `town` / `road` / `building` / `address` | text + keyword 子字段 | 五级地址要素 |
| `*_tokens` / `*_pinyin` | text（whitespace 分析器） | 空格切词与全拼 |
| `x` / `y` | float | 经纬度 |
| `areausage_id` / `areausag_name` / `areausage_tag` | keyword / text / boolean | 用地属性 |
| `raw` | object | 原始记录快照（building_id、aoi、town、road、building、address、x、y） |

样例（实测）：
```json
{"aoi":"深圳软件园","town":"粤海街道","building":"深圳软件园2栋",
 "address":"深圳市南山区高新中三道2号深圳软件园一期","x":113.93463215,"y":22.54790852,
 "aoi_tokens":"深圳 软件园","aoi_pinyin":"shen zhen ruan jian yuan",
 "raw":{"building_id":"bld55cc03b959dacc4c346ac4867d", …}}
```

### 2.2 节点 B（198）

| 索引 | 文档数 | 大小 | 分片/副本 | 说明 |
|------|--------|------|-----------|------|
| `mapresource` | 9,740 | 3.8mb | 1/**1**（副本 UNASSIGNED） | 地图要素资源库（企业/POI/水系/出入口） |
| `api` | 1 | 4.1kb | 1/**1**（副本 UNASSIGNED） | 检索接口行为配置（查询词 + top_k） |

**mapresource 数据分布**（`type.keyword` 聚合，实测）：

| type | 文档数 | 含义 |
|------|--------|------|
| `env_enterprises` | 7,521 | 企业/园区 |
| `poi_3` | 1,650 | POI 点位 |
| `res_water` | 546 | 水系资源 |
| `sys_org` | 14 | 系统机构 |
| `aoi_3_entrance_exit` | 9 | AOI 出入口 |

`_id` 规则：`{type}_{id32}`（如 `aoi_3_entrance_exit_9c873fdb…`）。

字段（mapping）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` / `ID` | text / text(+keyword) | 主键（大小写两套历史字段并存） |
| `name` / `NAME` | text + `FPY`（全拼分析器）/ `SPY`（首拼分析器）/ `standard` 多字段 | 名称，支持拼音全拼、首字母、标准三种检索路径 |
| `address` / `ADDRESS` | 同上多字段 | 地址 |
| `type` / `TYPE` | text / text+keyword | 要素类型 |
| `geom` | **geo_point** | `{lat, lon}` 中心坐标，可 geo 查询 |
| `LATITUDE` / `LONGITUDE` | text | 数值以文本存储（历史字段） |

样例（实测）：
```json
{"id":"9c873fdbf7a89b2a3d994461d716f760","name":"凯丽花园(南3门)",
 "address":"凯丽花园(南3门)","geom":{"lat":22.54576895,"lon":113.93410757},
 "type":"aoi_3_entrance_exit","LONGITUDE":113.93410757,"LATITUDE":22.54576895}
```

**分词配置**（mapresource 索引级 settings）：
- `pinyiFullIndexAnalyzer` / `pinyiFullSearchAnalyzer`：keyword 切分 + `pinyin_full_filter`（keep_full_pinyin=true、lowercase、非中文也切拼音）
- `pinyiSimpleIndexAnalyzer`：keyword + `pinyin_simple_filter`（keep_first_letter=true）+ `edge_ngram_filter`(1~50)
- `pinyiSimpleSearchAnalyzer`：keyword + 首拼 filter（检索侧不叠 edge_ngram）
- 另声明了 `ik_max_word`（smart）tokenizer 备用
- `index.max_result_window=1000000`（允许深翻页/大范围检索）

**api 索引**（检索配置表）：
```json
{"_type":"query","text":"软件园","top_k":3}
```
含义：按 `text` 关键词返回前 `top_k` 条 mapresource 命中（相当于"热词/预置查询"配置，业务读该索引获取查询词与条数限制）。

---

## 3. ILM / 索引模板

两节点 ILM 策略均为内置默认（`7/30/90/180/365-days-default`、`logs`、`metrics`、`ml-*`、`slm-history`、`ilm-history`、`watch-history`、`synthetics`、`fleet-*` 等）。

实际在用的：
- **198**：
  - `kibana-event-log-policy` → `.kibana-event-log-7.17.22-000004~07`（rollover 30d/50gb，90d 删除）
  - `.deprecation-indexing-ilm-policy` → `.logs-deprecation` 数据流（30d 删除）
  - `ilm-history-ilm-policy` → `ilm-history-5` 数据流（90d 删除）
- **167**：
  - `ilm-history-ilm-policy` → `.ds-ilm-history-5-2026.11.17`
  - `.deprecation-indexing-ilm-policy` → `.logs-deprecation`

业务索引（addressbot_*、shenzhen_address_v1、mapresource、api）均未挂 ILM，属**静态全量库**，生命周期由数据更新方（地址bot 后端）管理（167 的 `addressbot_places_*` 时间戳索引 + `addressbot_places_current` 别名即版本切换机制）。

索引模板：两节点 `_cat/templates` 均为系统默认模板（monitoring/fleet/ml/logs/metrics 等），**没有自定义业务模板**。

---

## 4. Elasticsearch 接口功能明细（本业务可用的 REST 能力）

> 以下按"上传 / 提交 / 查询 / 下载(导出)"四类整理。7.17 与 8.x 的 URL 基本一致；8.x 移除文档 `_type`（示例中 198 出现 `_type` 为 7.x 遗留）。

### 4.1 提交 / 上传（写入类）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/{index}/_doc[/{id}]` | PUT/POST | 单条创建/更新（幂等覆盖） |
| `/{index}/_doc[/{id}]` | GET | 按 id 获取 |
| `/{index}/_doc/{id}` | DELETE | 按 id 删除 |
| `/{index}/_delete_by_query` | POST | 按条件批量删除 |
| `/{index}/_update/{id}` | POST | 局部更新（upsert 支持） |
| `/{index}/_bulk` / `/_bulk` | POST | ND-JSON 批量写入（index/delete/update），地址全量导入的主要通道 |
| `/{index}` | PUT | 建索引（可带 mapping/settings；如 167 建 `addressbot_places_{时间戳}`） |
| `/{index}` | DELETE | 删索引（旧版时间戳库下线） |
| `/_aliases` | POST | 原子切换 `addressbot_places_current` 指向新版本索引（先 add 新后 remove 旧） |
| `/{index}/_mapping` / `/_settings` | PUT | 更新 mapping（仅增字段）/动态 settings（如 `refresh_interval`） |
| `/{index}/_refresh` | POST | 强制刷新使写入立即可查 |

### 4.2 查询（检索类）

| 接口 | 说明 |
|------|------|
| `/{index}/_search` | DSL 检索：本业务实际用法——`term level:AOI_3`、`term city_name.keyword`、`match ngram_text`（子串召回）、`geo_distance`/`geo_bounding_box` on `location`(geo_point)、`match name.FPY/name.SPY`（拼音）、`match name.standard`；`max_result_window=1000000`（198）支持深翻页 |
| 聚合 | 本文档实测：`terms level` / `terms city_name.keyword` / `terms type.keyword`；也可做 `geo_grid`、`range` |
| `/{index}/_count` | 条件计数（本文档用于三个索引文档数核实） |
| `/{index}/_search?scroll` / PITS | 大结果集滚动/切片分页 |
| `/_search` async（`/{index}/_async_search`） | 长查询（8.x，167 可用；198 有 `.async-search` 系统索引） |
| `/{index}/_explain` / `_search?explain` | 打分诊断 |
| `/{index}/_termvectors` | 词向量/召回诊断 |
| `/_search_template` | 模板化检索 |

### 4.3 下载 / 导出（读取类）

| 接口 | 说明 |
|------|------|
| `/{index}/_search`（size 大值 + `track_total_hits`） | 常规导出，受 `max_result_window` 限制 |
| `/_search` + `search_after` | 稳定深度导出（配合 sort），替代深翻页 |
| `/_search/scroll` | 批量拉取全量数据（地址库全量下载通道） |
| `/{index}/_doc/{id}` | 单文档下载 |
| `/{index}/_reindex`（或 `_reindex` + remote） | 跨实例搬迁（167↔198 数据迁移通道，两实例互访走 `remote` 连接） |
| `/_snapshot/{repo}/{snap}` | 快照恢复（当前两节点均未配置仓库，未使用） |
| `/_cat/indices`、`/_cat/shards`、`/_cat/aliases` | 运维查看（本文档全部数据来源） |

### 4.4 集群 / 运维（管理类）

| 接口 | 说明 |
|------|------|
| `/_cluster/health` | 健康检查（green/yellow 判定） |
| `/_cluster/settings` | 查看/修改集群动态设置 |
| `/_cluster/reroute?retry_failed` | 强制重派 UNASSIGNED 分片 |
| `/_nodes`、`/_cat/nodes` | 节点资源（heap/ram/disk） |
| `/_ilm/policy`、`/_index_template`、`/_aliases` | ILM/模板/别名管理 |
| `/_security`（仅 198） | 用户/角色/RBAC 管理；198 已启用 basic + Security，167 未启用（**风险项**） |

### 4.5 两节点能力差异提示

| 能力 | 167（8.11.3） | 198（7.17.22） |
|------|---------------|----------------|
| 文档类型 | 无 `_type` | 有遗留 `_type`（`_doc`/`query`） |
| Async Search | 支持 | 不支持（仅 scroll） |
| Security | 未启用（匿名可写！） | Basic（elastic 用户） |
| pinyin/IK | 无插件（用 ngram 模拟） | analysis-pinyin + analysis-ik |
| 深翻页上限 | 10,000（默认） | 1,000,000（mapresource 特配） |

---

## 5. 与本项目（ids-gis-web）的关联

| 关联点 | 位置 | 说明 |
|--------|------|------|
| `VITE_GEOSERVER_URL=http://192.168.173.198:8080/geoserver/` | `.env.development` / `.env.local` / `.env.production` | 与 198 同机的 GeoServer，地图瓦片/要素服务 |
| `VITE_MAP_PROXY_API=http://ids-address-query-client/` | `.env.production` | 地址查询走后端代理服务（推测由 `ids-address-query-client` 后端封装对上述 ES 的调用；`src/**` 中无直接 ES/9200 引用，前端不直连 ES） |
| 前端检索消费 | — | 地址检索结果（AOI 面、POI 点、拼音/首字母召回）最终通过消息服务/后端接口进入 GIS 渲染 |

> 说明：`docs/source/07-协议事件清单.md` 与协议层 DTO 目前未出现 ES 相关事件键；如后续前端需新增地址检索事件，须同步协议清单与 DTO Schema。

---

## 6. 风险与待办

1. **167 无认证**：basic 版未启用 Security，`elastic` 之外的任何用户可直接读写，建议与 198 对齐（启用 Security 或至少防火墙限定内网）。
2. **198 副本 UNASSIGNED（yellow）**：`mapresource`、`api` 配置 1 副本但只有 1 个节点，副本永远 UNASSIGNED；建议单节点下调 `number_of_replicas=0`（需 `PUT _cluster` 动态设置）或扩节点。
3. **198 RAM 使用率 99%**：节点内存接近耗尽，关注堆 GC 与系统 OOM 风险。
4. `mapresource` 中 `LONGITUDE/LATITUDE` 为 text 类型且与 `geom` 重复，后续版本建议只保留 `geo_point`。
5. 数据口径：167 的 `addressbot_houduan` 与 `addressbot_places_20260805014830` 当前 45,183 条一致（后者为 08-05 快照），houduan 侧 docs.deleted=152（存在更新历史），places 侧为 0。
