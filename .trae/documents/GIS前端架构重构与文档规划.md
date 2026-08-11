# GIS 前端架构重构与文档输出规划

> 基于 `GIS控制.md`（核心）+ `GIS端整体架构_v2.md`（参考）+ 其他架构文档

## 一、现状分析

### 1.1 已有实现

| 模块 | 文件 | 状态 | 说明 |
|------|------|------|------|
| 协议常量 | `src/const/const.message.type.ts` | ✅ 完整 | 包含所有 eventType 定义 |
| 通用协议 | `src/controller/core/protocol/GenericProtocol.ts` | ✅ 完整 | G-V/G-G/G-S/G-K 系列 |
| 业务协议 | `src/controller/core/protocol/BusinessProtocol.ts` | ✅ 完整 | EC/DC/GC/BC 系列 |
| I/O 协议 | `src/controller/core/protocol/IOProtocol.ts` | ✅ 完整 | OC/IC 系列 |
| InputController | `src/controller/core/io/InputController.ts` | ✅ 完整 | 消息订阅入口 |
| GenericController | `src/controller/core/generic/*.ts` | ⚠️ 部分 | 通用控制器（待完善） |
| BusinessController | `src/controller/core/business/*.ts` | ⚠️ 部分 | 业务控制器（待完善） |
| OutputController | `src/controller/core/io/OutputController.ts` | ⚠️ 部分 | 消息发布（待完善） |
| MessageStore | `src/store/useMessageStore.ts` | ✅ 完整 | 消息中枢+发布订阅 |
| WebSocket | `src/hooks/useWebSocket.ts` | ✅ 完整 | WS 客户端封装 |

### 1.2 架构对比

| 维度 | GIS控制.md | v2文档 | 代码现状 |
|------|-----------|--------|---------|
| 架构模式 | Controller 分层 | GISAppService + EventBus | Controller 模式 |
| 消息中枢 | 协议驱动 | Event Bus | MessageStore |
| 场景管理 | 业务控制层 | SceneManager | 分散在各 Controller |
| 组件层 | 未详细定义 | 基础组件+业务组件 | 已有基础实现 |

### 1.3 核心设计决策

**采用 GIS控制.md 的 Controller 分层架构**，整合 v2 文档中的：
- MessageStore 作为统一消息中枢（已有）
- 场景管理概念（可增强现有 Controller）

---

## 二、待输出文档清单

### 2.1 核心文档（用户明确要求）

| 文档名 | 文件路径 | 说明 |
|--------|----------|------|
| GIS前端整体架构设计 | `mds/GIS前端整体架构设计.md` | 整合 Controller + MessageStore，分层设计 |
| 前端后端交互时序图 | `mds/前端后端交互时序图.md` | 覆盖完整业务流程 |
| 前端协议对象服务清单 | `mds/前端协议对象服务清单.md` | eventType → 数据结构 → 消费方 → 后端接口 |

### 2.2 建议生成的辅助文档

| 文档名 | 文件路径 | 说明 |
|--------|----------|------|
| Controller 层详细设计 | `mds/internal/Controller层详细设计.md` | 各 Controller 子类职责边界、方法签名 |
| 消息协议数据字典 | `mds/internal/消息协议数据字典.md` | 所有 eventType 的完整 TypeScript 接口定义 |
| 场景状态机定义 | `mds/internal/场景状态机定义.md` | 场景枚举、状态流转图、切换规则 |

---

## 三、文档输出详细计划

### 3.1 GIS前端整体架构设计.md

**内容结构：**

```
一、总体架构设计
  1.1 架构理念
  1.2 分层架构图
  1.3 模块职责矩阵

二、核心模块设计
  2.1 MessageStore（消息中枢）
  2.2 InputController（输入控制层）
  2.3 GenericController（通用控制层）
  2.4 BusinessController（业务控制层）
  2.5 OutputController（输出控制层）

三、业务场景与协议映射
  3.1 场景定义
  3.2 协议触发矩阵

四、数据流设计
  4.1 消息信封格式
  4.2 发布订阅拓扑
  4.3 WebSocket 通信模型

五、技术决策记录（ADR）
```

**核心设计要点：**
- 以 GIS控制.md 的三层 Controller 为骨架
- MessageStore 作为唯一消息中枢
- 整合 v2 文档的场景管理概念
- 暂不涉及插件库设计

### 3.2 前端后端交互时序图.md

**覆盖场景：**

| 场景 | 触发条件 | 关键时序 |
|------|----------|----------|
| 值守阶段 | 系统启动 | 加载图层、订阅 WS |
| 来电弹屏 | 119 来电 | WS 推送粗定位圈 |
| 问询研判 | 确认地址 | 画像同步→微围栏加载 |
| 调派初始化 | 确认警情 | 加载围栏→车辆→路径 |
| 调派执行 | 一键调派 | HTTP 调派→WS 状态推送 |
| 途中跟踪 | 车辆出动 | GPS 实时推送→平滑动画 |
| 到场作战 | 首车到场 | 场景切换→微观要素加载 |

**通信方式：**
- HTTP API：初始化数据、主动查询
- WebSocket：实时推送、状态变更

### 3.3 前端协议对象服务清单.md

**内容结构：**

```
一、协议分类总览
  1.1 输入控制（IC）协议
  1.2 通用控制（GC）协议
  1.3 业务控制（EC/DC/BC）协议
  1.4 输出控制（OC）协议

二、协议详情
  2.1 每个 eventType 的完整定义：
    - eventType 名称
    - 数据接口（TypeScript）
    - 触发条件
    - 内部调用链路
    - 关联后端接口（HTTP/WS）

三、后端接口映射表
  - HTTP API → 消费组件
  - WS 推送 → 消费组件
```

---

## 四、实施步骤

### Step 1: 整合现有代码，输出《GIS前端整体架构设计.md》

**输入：**
- GIS控制.md（核心架构）
- v2 文档（场景管理概念）
- 代码库现有实现

**输出文件：**
- `d:\work\telewave\ids\ids-gis-web\mds\GIS前端整体架构设计.md`

### Step 2: 基于架构设计，输出《前端后端交互时序图.md》

**输入：**
- GIS交互时序图.md（原始时序）
- GIS后端微服务能力清单.md（后端能力）
- 新架构设计

**输出文件：**
- `d:\work\telewave\ids\ids-gis-web\mds\前端后端交互时序图.md`

### Step 3: 输出《前端协议对象服务清单.md》

**输入：**
- const.message.type.ts（现有常量）
- GenericProtocol.ts（现有协议）
- BusinessProtocol.ts（现有协议）
- IOProtocol.ts（现有协议）
- GIS后端微服务能力清单.md（后端接口映射）

**输出文件：**
- `d:\work\telewave\ids\ids-gis-web\mds\前端协议对象服务清单.md`

---

## 五、关键设计决策

### 5.1 架构模式选择

**决策：采用 Controller 分层架构（来自 GIS控制.md）**

| 方案 | 优点 | 缺点 |
|------|------|------|
| GIS控制.md Controller | 协议驱动清晰、易于扩展 | 需要理解协议体系 |
| v2文档 GISAppService | 面向应用层直观 | 与现有代码差异大 |

**结论**：以 GIS控制.md 为核心，整合现有代码实现，保持技术延续性。

### 5.2 消息系统选择

**决策：统一 MessageStore（已有实现）**

- 支持 WebSocket + postMessage 双通道
- 发布订阅模式
- 统一消息信封格式

### 5.3 场景管理策略

**决策：场景逻辑分散在各 BusinessController**

- 暂不引入独立的 SceneManager
- 场景切换逻辑封装在各业务 Controller
- 后续可演进为独立组件

---

## 六、验证步骤

1. **文档完整性检查**
   - [ ] 架构设计覆盖所有 Controller
   - [ ] 时序图覆盖完整业务流程
   - [ ] 协议清单覆盖所有 eventType

2. **与代码一致性检查**
   - [ ] eventType 与 const.message.type.ts 一致
   - [ ] 数据结构与 Protocol 文件一致
   - [ ] 控制器方法与设计一致

3. **与后端文档一致性检查**
   - [ ] HTTP API 映射正确
   - [ ] WS 推送事件对应
   - [ ] 数据格式兼容

---

## 七、附录

### 7.1 参考文档

| 文档 | 路径 | 用途 |
|------|------|------|
| GIS控制.md | `mds/external/GIS控制.md` | **核心架构参考** |
| GIS端整体架构_v2.md | `mds/internal/GIS端整体架构_v2.md` | 场景管理概念 |
| GIS后端微服务能力清单.md | `mds/internal/GIS后端微服务能力清单.md` | 后端接口映射 |
| GIS交互时序图.md | `mds/internal/GIS交互时序图.md` | 原始时序参考 |
| GIS端整体架构.md | `mds/internal/GIS端整体架构.md` | 组件层参考 |

### 7.2 关键代码文件

| 文件 | 路径 | 用途 |
|------|------|------|
| 消息类型常量 | `src/const/const.message.type.ts` | eventType 定义 |
| 通用协议 | `src/controller/core/protocol/GenericProtocol.ts` | 数据结构定义 |
| 业务协议 | `src/controller/core/protocol/BusinessProtocol.ts` | 数据结构定义 |
| I/O 协议 | `src/controller/core/protocol/IOProtocol.ts` | 数据结构定义 |
| 消息中枢 | `src/store/useMessageStore.ts` | 发布订阅实现 |
| 输入控制器 | `src/controller/core/io/InputController.ts` | 协议订阅入口 |
