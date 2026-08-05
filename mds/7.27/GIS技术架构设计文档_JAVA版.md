# GIS地图模块 — 技术架构设计文档（Java版）

> 版本：v3.0（Java技术栈重构版）
> 日期：2026-07-22
> 状态：正式版
> 技术栈：Java 17 / Spring Boot 3.x / Spring Cloud Alibaba

---

## 一、模块定位与架构目标

### 1.1 定位

GIS地图模块是消防接处警系统的**态势呈现层**，承载5大业务场景（S1-S5）的地图可视化与交互能力。模块通过订阅DDD领域事件获取实时态势数据，在地图上广播呈现，**不驱动任何状态机流转**。

### 1.2 架构目标

| 目标 | 描述 |
|------|------|
| 高性能 | 场景初始化 ≤1.5s，地图更新延迟 ≤500ms |
| 高可用 | WebSocket断连3s内自动重连，降级由前端兜底 |
| 可扩展 | BFF层无状态水平扩展，支持 ≥200 坐席并发 |
| 协议统一 | 屏蔽下游多协议（HTTP/MQ/WebSocket），统一输出给前端 |

---

## 二、系统架构图

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端（Web / 坐席终端）                       │
│        ECharts GL / Mapbox GL  │  Vuex / Redux 状态管理           │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP / WebSocket (STOMP)
┌────────────────────────▼────────────────────────────────────────┐
│                      GIS-BFF 服务（Spring Boot）                    │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │
│  │   SceneManager │  │  LayerAggregator│  │ ProtocolConverter  │ │
│  │   场景管理器    │  │   图层聚合器    │  │   协议转换器        │ │
│  └────────────────┘  └────────────────┘  └────────────────────┘ │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │
│  │  EventRouter   │  │ TrafficPoller  │  │   RoutePlanner     │ │
│  │  事件路由器    │  │  路况轮询器    │  │   路径规划器        │ │
│  └────────────────┘  └────────────────┘  └────────────────────┘ │
│  ┌────────────────┐  ┌────────────────┐                         │
│  │ DispatchSvc    │  │ VehicleTracker │                         │
│  │ 调派服务       │  │ 车辆跟踪器     │                         │
│  └────────────────┘  └────────────────┘                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
     ┌───────────────────┼────────────────────┐
     ▼                   ▼                    ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
│  RabbitMQ   │  │  REST Client │  │   GeoServer      │
│  消息队列    │  │  HTTP调用    │  │   WMS / WFS      │
└─────────────┘  └──────────────┘  └──────────────────┘
     │                   │                    │
     ▼                   ▼                    ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
│ 警情生命周期 │  │ 车辆管理     │  │  高德/第三方API   │
│  车辆管理   │  │ 接警问询     │  │                  │
│  调派模块   │  │ 预案管理     │  └──────────────────┘
└─────────────┘  └──────────────┘
```

### 2.2 技术选型

| 组件 | 选型 | 说明 |
|------|------|------|
| 基础框架 | Spring Boot 3.x | Java 17+，Starter全家桶 |
| API层 | Spring MVC + WebFlux（响应式） | REST + WebSocket双协议 |
| 消息队列 | RabbitMQ / Kafka | 订阅警情/车辆/调派领域事件 |
| 数据库 | PostgreSQL + PostGIS | GIS数据持久化，图层配置存储 |
| 缓存 | Redis（Jedis/Lettuce） | 场景状态缓存、WebSocket会话、轨迹数据 |
| GIS引擎 | GeoServer | WMS/WFS服务，前端直连 |
| 实时通信 | Spring WebSocket + STOMP | WebSocket双通道，@SendToUser注解 |
| 服务注册 | Nacos | 服务注册与发现 |
| 配置中心 | Nacos Config | 统一配置管理 |
| 链路追踪 | OpenTelemetry + SkyWalking | 全链路可观测 |
| 日志 | Logback + ELK | 结构化日志 |

---

## 三、模块详细设计

### 3.1 内部模块划分

```
com.gis.bff
├── GisBffApplication.java
│
├── controller/
│   ├── SceneController.java          # 场景初始化 HTTP API
│   ├── DispatchController.java        # 调派相关 API
│   ├── VehicleController.java         # 车辆查询 API
│   └── RouteController.java           # 路径规划 API
│
├── service/
│   ├── SceneService.java              # 场景管理服务
│   ├── LayerMetaService.java          # 图层元数据服务（GeoServer透传）
│   ├── DispatchService.java           # 调派状态服务
│   ├── VehicleQueryService.java       # 车辆查询服务
│   └── RoutePlanService.java          # 路径规划服务
│
├── websocket/
│   ├── GisWebSocketConfig.java       # WebSocket STOMP配置
│   ├── GisChannelInterceptor.java     # 通道拦截器（认证/鉴权）
│   └── handler/
│       ├── LayerUpdateHandler.java    # 图层数据推送Handler
│       ├── VehiclePositionHandler.java # 车辆位置推送Handler
│       └── AlertHandler.java          # 告警推送Handler
│
├── mq/
│   ├── consumer/
│   │   ├── AlarmEventConsumer.java   # 警情事件消费者
│   │   ├── VehicleEventConsumer.java  # 车辆事件消费者
│   │   ├── DispatchEventConsumer.java # 调派事件消费者
│   │   └── CallEventConsumer.java    # 来电/问询事件消费者
│   └── publisher/
│       └── GisEventPublisher.java     # BFF→前端事件发布
│
├── integration/
│   ├── GeoServerClient.java          # GeoServer WFS/WMS客户端（不代理，仅元数据）
│   ├── VehicleClient.java             # 车辆管理服务HTTP客户端
│   ├── AlarmClient.java              # 警情生命周期服务HTTP客户端
│   ├── DispatchClient.java           # 调派模块HTTP客户端
│   └── AmapClient.java               # 高德路径规划/路况HTTP客户端
│
├── domain/
│   ├── model/
│   │   ├── SceneContext.java         # 场景上下文
│   │   ├── LayerMeta.java            # 图层元数据（layer + visible）
│   │   ├── VehicleInfo.java          # 车辆实时态势
│   │   ├── IncidentInfo.java         # 警情态势
│   │   └── PositionPoint.java        # GPS坐标点
│   └── event/
│       ├── GisLayerUpdateEvent.java  # 图层更新事件
│       ├── VehiclePositionEvent.java  # 车辆位置事件
│       └── AlertEvent.java           # 告警事件
│
├── config/
│   ├── RabbitMQConfig.java           # MQ配置（Exchange/Queue/Binding）
│   ├── RedisConfig.java             # Redis配置（Session/缓存）
│   ├── WebSocketConfig.java          # WebSocket STOMP配置
│   └── RestTemplateConfig.java       # HTTP Client配置
│
└── util/
    ├── GeoJSONConverter.java          # GeoJSON工具（Tur4j）
    └── CqlFilterBuilder.java         # GeoServer CQL过滤器构建器
```

---

## 四、核心类设计

### 4.1 场景上下文（SceneContext）

```java
@Data
@RedisHash
public class SceneContext implements Serializable {

    @Id
    private String sessionId;           // 坐席会话ID

    private SceneType scene;            // S1-S5
    private String operatorId;         // 操作员ID
    private String incidentId;          // 当前警情ID（可选）
    private String inquiryId;          // 当前问询ID（可选）
    private String callId;             // 当前通话ID（可选）
    private String primaryOrgId;       // 主管队站ID（可选）

    private SceneStatus status;         // ACTIVE / TRANSITIONING / DISPOSED
    private Instant entryTime;         // 场景进入时间

    // US1-4 地图中心联动
    private MapCenter mapCenter;       // 地图中心点
    private Boolean microRegionEnabled;// 微区域模型联动开关

    // 缓存TTL：24小时
}

@Data
public class MapCenter implements Serializable {
    private Double lng;
    private Double lat;
    private Integer zoom;              // 1-19
}
```

### 4.2 图层元数据（LayerMeta）

```java
@Data
@Builder
public class LayerMeta {
    /**
     * GeoServer视图/图层名称
     * 例：gis:view_juris_zone、gis:env_entrance_exit
     */
    private String layer;

    /**
     * 默认是否展示
     */
    private Boolean visible;

    /**
     * GeoServer样式名称（可选）
     * 例：org_zone_style
     */
    private String style;
}
```

### 4.3 场景初始化服务

```java
@Service
@RequiredArgsConstructor
public class SceneService {

    private final LayerMetaService layerMetaService;
    private final VehicleQueryService vehicleQueryService;
    private final DispatchService dispatchService;

    /**
     * POST /gis/v2/scenes/{scene}/init
     * 场景初始化：聚合该场景所需的全量图层元数据
     */
    public SceneInitResponse initScene(SceneInitRequest request) {
        // 1. 构建/更新SceneContext（Redis存储）
        SceneContext ctx = buildSceneContext(request);

        // 2. 获取图层元数据列表（BFF仅提供layer+visible，前端直连GeoServer）
        List<LayerMeta> geoLayers = layerMetaService.getLayersForScene(
            request.getScene(),
            ctx
        );

        // 3. 聚合实时态势数据（MQ推送部分）
        List<VehicleInfo> vehicles = null;
        IncidentInfo incident = null;

        if (StrUtil.isNotBlank(request.getIncidentId())) {
            vehicles = vehicleQueryService.getAvailableVehicles(
                request.getPrimaryOrgId()
            );
            incident = alarmQueryService.getIncident(request.getIncidentId());
        }

        // 4. 构建响应
        return SceneInitResponse.builder()
            .scene(request.getScene())
            .geoLayers(geoLayers)                          // 前端直连GeoServer
            .dynamicLayers(buildDynamicLayers(vehicles, incident))
            .sceneConfig(buildSceneConfig(request.getScene()))
            .build();
    }
}
```

### 4.4 图层元数据服务（LayerMetaService）

```java
@Service
@RequiredArgsConstructor
public class LayerMetaService {

    /**
     * 获取指定场景的图层元数据列表
     * BFF仅传递 layer + visible，前端据此直连GeoServer WMS/WFS
     *
     * @return List<LayerMeta> 供前端直连GeoServer的视图名+可见性数组
     */
    public List<LayerMeta> getLayersForScene(SceneType scene, SceneContext ctx) {
        return switch (scene) {
            // S1值守：全城态势总览
            case S1 -> List.of(
                LayerMeta.builder().layer("gis:view_res_org_dept").visible(true).build(),
                LayerMeta.builder().layer("gis:view_juris_zone").visible(true).build(),
                LayerMeta.builder().layer("gis:env_greatchina_road").visible(true).build(),
                LayerMeta.builder().layer("gis:env_entrance_exit").visible(true).build(),
                LayerMeta.builder().layer("gis:view_env_enterprises").visible(true).build(),
                LayerMeta.builder().layer("gis:view_env_building").visible(true).build()
            );
            // S2来电弹屏：主管队站+辖区
            case S2 -> List.of(
                LayerMeta.builder().layer("gis:view_res_org_dept").visible(true).build(),
                LayerMeta.builder().layer("gis:view_juris_zone").visible(true).build(),
                LayerMeta.builder().layer("gis:env_entrance_exit").visible(true).build(),
                LayerMeta.builder().layer("gis:view_key_landmarks").visible(true).build()
            );
            // S3问询：微围栏+周边资源
            case S3 -> List.of(
                LayerMeta.builder().layer("gis:view_res_org_dept").visible(true).build(),
                LayerMeta.builder().layer("gis:view_juris_zone").visible(true).build(),
                LayerMeta.builder().layer("gis:env_entrance_exit").visible(true).build(),
                LayerMeta.builder().layer("gis:view_env_building").visible(true).build(),
                LayerMeta.builder().layer("gis:env_hydrant").visible(true).build()
            );
            // S4调派：主管+支撑+微围栏+道路
            case S4 -> List.of(
                LayerMeta.builder().layer("gis:view_res_org_dept").visible(true).build(),
                LayerMeta.builder().layer("gis:view_juris_zone").visible(true).build(),
                LayerMeta.builder().layer("gis:env_entrance_exit").visible(true).build(),
                LayerMeta.builder().layer("gis:view_env_building").visible(true).build(),
                LayerMeta.builder().layer("gis:env_hydrant").visible(true).build(),
                LayerMeta.builder().layer("gis:env_greatchina_road").visible(true).build()
            );
            // S5跟踪：微围栏+集结区+车辆
            case S5 -> List.of(
                LayerMeta.builder().layer("gis:view_res_org_dept").visible(true).build(),
                LayerMeta.builder().layer("gis:view_juris_zone").visible(true).build(),
                LayerMeta.builder().layer("gis:env_entrance_exit").visible(true).build(),
                LayerMeta.builder().layer("gis:view_env_building").visible(true).build(),
                LayerMeta.builder().layer("gis:env_hydrant").visible(true).build(),
                LayerMeta.builder().layer("gis:env_muster_zone").visible(true).build()
            );
        };
    }
}
```

### 4.5 WebSocket配置

```java
@Configuration
@EnableWebSocketMessageBroker
public class GisWebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // 内置内存broker，支持STOMP
        registry.enableSimpleBroker("/queue", "/topic");
        // 前端订阅前缀
        registry.setApplicationDestinationPrefixes("/app");
        // 点对点消息前缀
        registry.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // WebSocket握手端点
        registry.addEndpoint("/ws/gis")
            .setAllowedOriginPatterns("*")
            .withSockJS();
        // 也支持原生WS（不带SockJS）
        registry.addEndpoint("/ws/gis")
            .setAllowedOriginPatterns("*");
    }

    @Override
    public void configureClientInboundChannel(ChannelInterceptor interceptor) {
        // 认证/鉴权拦截器
    }
}
```

### 4.6 事件推送服务

```java
@Service
@RequiredArgsConstructor
public class GisEventPublisher {

    private final SimpMessagingTemplate messagingTemplate;

    /**
     * 推送图层更新事件到前端
     * 通道：/queue/gis.layer.{scene}
     */
    public void pushLayerUpdate(String sessionId, String scene, Object payload) {
        GisMessage message = GisMessage.builder()
            .channel("gis.layer." + scene)
            .messageId(UUID.randomUUID().toString())
            .timestamp(Instant.now())
            .eventType("LAYER_UPDATE")
            .payload(payload)
            .build();
        messagingTemplate.convertAndSendToUser(sessionId, "/queue/gis.layer." + scene, message);
    }

    /**
     * 推送告警事件
     */
    public void pushAlert(String sessionId, AlertType alertType, String message) {
        Map<String, Object> payload = Map.of(
            "alert_type", alertType.name(),
            "message", message,
            "timestamp", Instant.now()
        );
        GisMessage message2 = GisMessage.builder()
            .channel("gis.alert")
            .messageId(UUID.randomUUID().toString())
            .timestamp(Instant.now())
            .eventType("ALERT")
            .payload(payload)
            .build();
        messagingTemplate.convertAndSendToUser(sessionId, "/queue/gis.alert", message2);
    }

    /**
     * 推送视图切换事件（首车到场）
     */
    public void pushViewSwitch(String sessionId, Integer countdownSeconds, String targetView) {
        Map<String, Object> payload = Map.of(
            "trigger", "FIRST_VEHICLE_ARRIVED",
            "countdown_seconds", countdownSeconds,
            "target_view", targetView,
            "cancelable", true
        );
        GisMessage message3 = GisMessage.builder()
            .channel("gis.view")
            .messageId(UUID.randomUUID().toString())
            .timestamp(Instant.now())
            .eventType("VIEW_SWITCH")
            .payload(payload)
            .build();
        messagingTemplate.convertAndSendToUser(sessionId, "/queue/gis.view", message3);
    }
}
```

### 4.7 消息队列消费者

#### 4.7.1 警情事件消费者

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class AlarmEventConsumer {

    private final GisEventPublisher publisher;
    private final SceneRepository sceneRepository;

    @RabbitListener(queues = "${mq.queues.alarm-events}")
    public void onAlarmEvent(AlarmEvent event) {
        log.info("收到警情事件: type={}, incidentId={}", event.getType(), event.getIncidentId());

        switch (event.getType()) {
            case CREATED -> handleAlarmCreated(event);
            case STATUS_CHANGED -> handleStatusChanged(event);
            case LOCATION_CHANGED -> handleLocationChanged(event);
        }
    }

    private void handleAlarmCreated(AlarmEvent event) {
        // 推送红色警情图标
        Map<String, Object> payload = Map.of(
            "layer_name", "incident_icons",
            "data", Map.of(
                "incident_id", event.getIncidentId(),
                "lng", event.getLng(),
                "lat", event.getLat(),
                "status", "CREATED",
                "color", "#FF4D4F"
            ),
            "update_mode", "FULL"
        );

        // 推送给所有订阅该警情的坐席
        sceneRepository.findByIncidentId(event.getIncidentId())
            .forEach(ctx -> publisher.pushLayerUpdate(ctx.getSessionId(), ctx.getScene().name(), payload));
    }
}
```

#### 4.7.2 车辆事件消费者

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class VehicleEventConsumer {

    private final GisEventPublisher publisher;
    private final RedisTemplate<String, Object> redisTemplate;
    private final VehicleTrackService vehicleTrackService;

    @RabbitListener(queues = "${mq.queues.vehicle-events}")
    public void onVehicleEvent(VehicleEvent event) {
        log.info("收到车辆事件: type={}, carId={}", event.getType(), event.getCarId());

        switch (event.getType()) {
            case POSITION_CHANGED -> handlePositionChanged(event);
            case STATUS_CHANGED -> handleStatusChanged(event);
            case ARRIVED -> handleArrived(event);
            case RETURNED -> handleReturned(event);
        }
    }

    private void handlePositionChanged(VehicleEvent event) {
        // US5-1: 实时轨迹写入Redis
        vehicleTrackService.appendTrackPoint(
            event.getCarId(),
            event.getIncidentId(),
            PositionPoint.builder()
                .lng(event.getLng())
                .lat(event.getLat())
                .gpsTime(event.getGpsTime())
                .speed(event.getSpeed())
                .heading(event.getHeading())
                .build()
        );

        // 推送车辆位置更新（30s频率，由上游MQ控制）
        Map<String, Object> payload = Map.of(
            "layer_name", "vehicle_icons",
            "data", Map.of(
                "car_id", event.getCarId(),
                "lng", event.getLng(),
                "lat", event.getLat(),
                "speed", event.getSpeed(),
                "heading", event.getHeading(),
                "gps_time", event.getGpsTime()
            ),
            "update_mode", "DIFF"
        );

        // 推送给订阅该车辆的坐席
        publisher.pushLayerUpdate(event.getSessionId(), "S5", payload);
    }

    private void handleArrived(VehicleEvent event) {
        // US5-3: 首车到场触发视图切换倒计时
        if (event.getIsFirstVehicle()) {
            publisher.pushViewSwitch(event.getSessionId(), 3, "MICRO");
        }
    }

    private void handleReturned(VehicleEvent event) {
        // 消除车辆图标
        publisher.pushLayerRemove(event.getSessionId(), "S5",
            List.of(event.getCarId()), "VEHICLE_RETURNED");
    }
}
```

### 4.8 调派状态服务

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class DispatchService {

    private final GisEventPublisher publisher;
    private final RedisTemplate<String, Object> redisTemplate;

    /**
     * US4-6: 车辆选中/取消选中
     * 前端勾选 → BFF记录临时状态 → 同步至前端调派表单
     */
    public DispatchSelectResponse handleVehicleSelect(DispatchSelectRequest request) {
        String key = "dispatch:selected:" + request.getIncidentId();

        if ("SELECT".equals(request.getAction())) {
            redisTemplate.opsForSet().add(key, request.getCarId());
        } else {
            redisTemplate.opsForSet().remove(key, request.getCarId());
        }

        // 实时同步给前端（WebSocket）
        Set<Object> selected = redisTemplate.opsForSet().members(key);
        publisher.pushDispatchSelectUpdate(request.getSessionId(), selected);

        return DispatchSelectResponse.builder()
            .selectedVehicles(selected.stream().map(Object::toString).toList())
            .dispatchReady(true)
            .build();
    }

    /**
     * US4-6: 一键调派提交 + 冲突检测
     */
    public DispatchSubmitResponse handleSubmit(DispatchSubmitRequest request) {
        // 1. 提交给调派模块
        DispatchSubmitResponse resp = dispatchClient.submitDispatch(request);

        // 2. 启动5s冲突检测
        scheduleConflictCheck(request.getSessionId(), request.getIncidentId(), request.getVehicleIds());

        // 3. 推送确认
        publisher.pushDispatchConfirmed(request.getSessionId(), resp.getDispatchOrderId());

        return resp;
    }

    /**
     * 5s超时检测：若前端未刷新确认，推送冲突警告
     */
    @Async
    public void scheduleConflictCheck(String sessionId, String incidentId, List<String> vehicleIds) {
        try {
            Thread.sleep(5000);
            Boolean frontendConfirmed = redisTemplate.opsForValue()
                .get("dispatch:confirmed:" + incidentId);
            if (frontendConfirmed == null || !frontendConfirmed) {
                publisher.pushAlert(sessionId, AlertType.DISPATCH_CONFLICT,
                    "已有调派单生成，请刷新页面确认");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

### 4.9 路况轮询器

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class TrafficPoller {

    private final AmapClient amapClient;
    private final GisEventPublisher publisher;
    private final SceneRepository sceneRepository;

    /**
     * 每30s轮询高德路况，推送给所有活跃场景
     */
    @Scheduled(fixedRate = 30000)
    public void pollTraffic() {
        log.debug("开始轮询高德实时路况...");

        try {
            TrafficResult result = amapClient.queryTrafficStatus();

            Map<String, Object> payload = Map.of(
                "layer_name", "traffic_realtime",
                "data", result.getTrafficSegments(),  // List<Segment> 含geom+color
                "update_mode", "DIFF"
            );

            // 推送给所有S1/S4/S5场景的坐席
            sceneRepository.findActiveByScene(SceneType.S1)
                .forEach(ctx -> publisher.pushLayerUpdate(ctx.getSessionId(), "S1", payload));

            sceneRepository.findActiveByScene(SceneType.S4)
                .forEach(ctx -> publisher.pushLayerUpdate(ctx.getSessionId(), "S4", payload));

            sceneRepository.findActiveByScene(SceneType.S5)
                .forEach(ctx -> publisher.pushLayerUpdate(ctx.getSessionId(), "S5", payload));

        } catch (Exception e) {
            log.error("路况轮询失败", e);
        }
    }
}
```

---

## 五、核心流程设计

### 5.1 场景初始化流程（S4-调派为例）

```
前端                          GIS-BFF（Java）                      下游服务
  │                                │                                  │
  │ POST /gis/v2/scenes/S4/init   │                                  │
  │  incident_id=INC001           │                                  │
  │  primary_org_id=ORG001        │                                  │
  │──────────────────────────────>│                                  │
  │                                │ SceneService.initScene()         │
  │                                │   ↓                              │
  │                                │ LayerMetaService.getLayersForScene()│
  │                                │   → 返回 LayerMeta[]（layer+visible）
  │                                │   → 前端直连GeoServer获取图层数据  │
  │                                │                                  │
  │                                │ GeoServerClient.queryJurisZone()│
  │                                │  GET WFS gis:view_juris_zone     │
  │                                │───────────────────────────────>GeoServer
  │                                │<────────────────────────────── GeoServer
  │                                │                                  │
  │                                │ VehicleQueryService              │
  │                                │  .getAvailableVehicles(ORG001)   │
  │                                │───────────────────────────────>车辆管理
  │                                │<───────────────────────────────车辆管理
  │                                │                                  │
  │                                │ AlarmClient.getIncident(INC001)  │
  │                                │───────────────────────────────>警情生命周期
  │                                │<───────────────────────────────警情生命周期
  │                                │                                  │
  │                                │ DispatchClient.getPlan(INC001)   │
  │                                │───────────────────────────────>调派模块
  │                                │<───────────────────────────────调派模块
  │                                │                                  │
  │<──────────────────────────────│ SceneInitResponse（layers+动态数据）│
  │                                │                                  │
  │ STOMP订阅 /user/{sessionId}   │                                  │
  │ /queue/gis.layer.S4           │                                  │
  │<──────────────────────────────│ 订阅成功                           │
  │                                │                                  │
  │                                │  ← 30s间隔MQ推送车辆位置更新        │
  │<──────────────────────────────│ VehiclePositionEvent (MQ)         │
  │<──────────────────────────────│ VehiclePositionEvent (MQ)         │
  │                                │                                  │
```

### 5.2 车辆调派交互流程（S4）

```
前端                      GIS-BFF（Java）              调派模块              车辆管理
  │                         │                          │                    │
  │ 点击车辆图标             │                          │                    │
  │ SELECT                  │                          │                    │
  │──────────────────────>│                          │                    │
  │                         │ Redis: SADD selected     │                    │
  │                         │────────────────────────>Redis                  │
  │                         │<────────────────────────Redis                  │
  │                         │ STOMP→前端 /queue/gis.layer.S4            │
  │<──────────────────────│ { selected_vehicles }       │                    │
  │                         │                          │                    │
  │ 点击"一键调派"           │                          │                    │
  │ SUBMIT                  │                          │                    │
  │──────────────────────>│                          │                    │
  │                         │ POST /dispatch/orders    │                    │
  │                         │────────────────────────>│                    │
  │                         │<────────────────────────│ CONFIRMED           │
  │                         │  启动5s冲突检测线程       │                    │
  │                         │ 等待前端CONFIRM回调       │                    │
  │                         │                          │                    │
  │ 前端已刷新（5s内）        │                          │                    │
  │ CONFIRM                 │                          │                    │
  │──────────────────────>│                          │                    │
  │                         │ Redis SET confirmed=true │                    │
  │                         │  取消冲突警告             │                    │
  │                         │                          │                    │
  │<──────────────────────│ DISPATCH_CONFIRMED        │                    │
  │ 显示"等待队站确认"       │                          │                    │
  │                         │                          │                    │
  │                         │ MQ: DispatchConfirmed    │                    │
  │                         │────────────────────────>│                    │
  │                         │                          │<───────────────────│
  │                         │                          │                    │
```

### 5.3 首车到场视图切换流程（S5）

```
车辆管理/移动指挥           GIS-BFF（Java）                   前端
     │                        │                                │
     │ VehicleArrived(first)   │                                │
     │ ARRIVED (MQ)            │                                │
     │──────────────────────>│                                │
     │                        │ VehicleEventConsumer            │
     │                        │  判断 isFirstVehicle=true        │
     │                        │                                │
     │                        │ STOMP→前端 /queue/gis.view     │
     │                        │ VIEW_SWITCH { countdown: 3s }  │
     │                        │──────────────────────────────>│
     │                        │                                │
     │                        │              3s倒计时中...      │
     │                        │                                │
     │                        │ STOMP←前端 /app/gis/cmd        │
     │                        │ VIEW_SWITCH_CANCELLED（用户取消）│
     │                        │<──────────────────────────────│
     │                        │  取消切换，维持宏观视图         │
     │                        │                                │
     │                        │ 或 3s后：                       │
     │                        │                                │
     │                        │ STOMP→前端 /queue/gis.view     │
     │                        │ MICRO_VIEW_ENGAGED             │
     │                        │ { zoom:16, center:微围栏中心 } │
     │                        │──────────────────────────────>│
     │                        │                                │
```

---

## 六、数据模型

### 6.1 核心实体

```java
// SceneContext（场景上下文）- 存储于Redis
@RedisHash
public class SceneContext {
    @Id private String sessionId;        // 坐席会话ID（主键）
    private SceneType scene;             // S1-S5
    private String operatorId;
    private String incidentId;
    private String primaryOrgId;
    private SceneStatus status;
    private Instant entryTime;
    private MapCenter mapCenter;         // US1-4
    private Boolean microRegionEnabled;
    @TimeToLive private Long expire;     // TTL: 24小时
}

// VehicleInfo（车辆实时态势）
@Data @Builder
public class VehicleInfo {
    private String carId;
    private String carName;
    private String carType;
    private String plateNumber;
    private String orgId;
    private VehicleStatus status;        // 待命/已出动/到场/归队
    private Double lng;
    private Double lat;
    private Double speedKmh;
    private Integer heading;             // 0-360
    private Instant gpsTime;
    private Boolean isPrimaryOrg;        // 是否主管队站车辆
    private Boolean isPreplanRecommended;
    private Boolean isSelected;         // 前端临时选中
    private Boolean isSelectable;
    private Integer etaMinutes;
    private Double distanceKm;
    private String capacity;
}

// GisMessage（统一WebSocket消息格式）
@Data @Builder
public class GisMessage {
    private String channel;             // gis.layer.S4 / gis.alert
    private String messageId;           // UUID
    private Instant timestamp;
    private String eventType;          // LAYER_UPDATE / LAYER_REMOVE / VIEW_SWITCH / ALERT
    private Object payload;
}
```

### 6.2 消息队列Topic配置

```java
@Configuration
@RequiredArgsConstructor
public class RabbitMQConfig {

    // 警情事件Exchange/Queue
    @Bean
    public TopicExchange alarmExchange() {
        return new TopicExchange("alarm.events", true, false);
    }

    @Bean
    public Queue alarmEventQueue() {
        return QueueBuilder.durable("gis.alarm.event.queue")
            .withArgument("x-dead-letter-exchange", "alarm.events.dlx")
            .build();
    }

    @Bean
    public Binding alarmBinding(Queue alarmEventQueue, TopicExchange alarmExchange) {
        return BindingBuilder.bind(alarmEventQueue)
            .to(alarmExchange)
            .with("alarm.#");
    }

    // 车辆事件
    @Bean
    public TopicExchange vehicleExchange() {
        return new TopicExchange("vehicle.events", true, false);
    }

    @Bean
    public Queue vehicleEventQueue() {
        return QueueBuilder.durable("gis.vehicle.event.queue").build();
    }

    @Bean
    public Binding vehicleBinding(Queue vehicleEventQueue, TopicExchange vehicleExchange) {
        return BindingBuilder.bind(vehicleEventQueue)
            .to(vehicleExchange)
            .with("vehicle.#");
    }
}
```

---

## 七、API接口清单

### 7.1 HTTP REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/gis/v2/scenes/{scene}/init` | 场景初始化（全量图层元数据+态势数据） |
| GET | `/gis/v2/layers/config` | 获取图层配置 |
| PUT | `/gis/v2/layers/config` | 保存图层配置 |
| POST | `/gis/v2/dispatch/vehicles/select` | 车辆选中/取消选中 |
| POST | `/gis/v2/dispatch/submit` | 一键调派提交 |
| GET | `/gis/v2/vehicles/station/{orgId}` | 队站车辆列表 |
| GET | `/gis/v2/vehicles/multi/query` | 多车位置查询（≤500辆） |
| GET | `/gis/v2/vehicles/{carId}/track` | 车辆历史轨迹 |
| GET | `/gis/v2/routes/plan` | 高德路径规划 |
| GET | `/gis/v2/incidents/{incidentId}/layer-data` | 警情图层数据 |
| GET | `/gis/v2/geoserver/juris-zone` | 查询辖区围栏（US4-2） |

### 7.2 WebSocket STOMP通道

| 通道 | 方向 | 内容 |
|------|------|------|
| `/user/{sessionId}/queue/gis.layer.{scene}` | BFF→前端 | 场景图层数据推送 |
| `/user/{sessionId}/queue/gis.alert` | BFF→前端 | 告警提示 |
| `/user/{sessionId}/queue/gis.view` | BFF→前端 | 视图切换触发 |
| `/user/{sessionId}/queue/gis.dispatching` | BFF→前端 | 调派状态同步 |
| `/app/gis/{sessionId}/cmd` | 前端→BFF | 视图切换确认等命令 |

---

## 八、关键设计决策

| # | 决策点 | 结论 | 理由 |
|---|--------|------|------|
| D1 | BFF vs 直连前端 | BFF聚合下游服务，前端不直连DDD领域服务 | 减少前端复杂度，统一协议，隐藏下游接口细节 |
| D2 | GeoServer调用 | BFF仅提供layer+visible，前端直连GeoServer | BFF不代理、不转发GeoServer数据，减少BFF负载 |
| D3 | 消息队列选型 | RabbitMQ（事件驱动场景）/ Kafka（大数据量） | 警情/车辆事件选RabbitMQ，调派事件可Kafka |
| D4 | 路况推送 | BFF 30s轮询高德，前端WebSocket推送 | BFF统一处理高德API限流和token管理 |
| D5 | 路径规划 | BFF调用高德，前端不直连 | 涉及敏感坐标，API Key不宜暴露前端 |
| D6 | 会话状态存储 | Redis，按sessionId分key | 支持坐席多端漫游（同一坐席不同终端） |
| D7 | 500m定位圈 | BFF生成GeoJSON圆Polygon，不依赖GeoServer | 快速响应，GeoServer不擅长动态圆生成 |
| D8 | 轨迹数据存储 | Redis List（carId→trackPoints），TTL=会话周期 | US5-1历史轨迹保留，内存友好 |
| D9 | 首车到场切换 | BFF推送倒计时，前端执行动画 | 减少BFF耦合，确保时序一致性 |
| D10 | 降级策略 | BFF故障时前端读取缓存+提示"数据暂不更新" | 不阻断核心业务流程 |
| D11 | 消息推送方式 | STOMP over WebSocket，@SendToUser点对点 | 支持坐席隔离，推送精准 |
| D12 | 冲突检测 | BFF侧5s超时检测，前端CONFIRM回调 | US4-6后端冲突警告机制 |

---

## 九、部署架构

### 9.1 容器化部署（K8s）

```
┌─────────────────────────────────────────────────────┐
│              Kubernetes Cluster                     │
│                                                    │
│  ┌─────────────────────────────────────────────┐   │
│  │         GIS-BFF Service                     │   │
│  │  Deployment: 2~N replicas                  │   │
│  │  HPA: CPU>70% 或 内存>80% 自动扩容          │   │
│  └──────────────┬──────────────────────────┘   │
│                 │                                 │
│  ┌──────────────▼──────────────────────────┐   │
│  │    ClusterIP Service (内部负载均衡)      │   │
│  └──────────────┬──────────────────────────┘   │
└─────────────────┼───────────────────────────────┘
                  │
    ┌─────────────┼──────────────┐
    ▼             ▼              ▼
┌──────────┐ ┌────────┐  ┌────────────┐
│ GeoServer │ │RabbitMQ│  │ PostgreSQL │
│           │ │        │  │  + PostGIS │
└──────────┘ └────────┘  └────────────┘
     │           │           │
     ▼           ▼           ▼
  前端直连   下游DDD   GIS数据持久化
              服务
```

### 9.2 资源配置建议

| 组件 | 规格 | 说明 |
|------|------|------|
| GIS-BFF Pod | 2核CPU / 4GB内存 × 2副本 | 建议≥2副本，HPA自动扩缩 |
| GeoServer | 4核CPU / 8GB内存 | 静态图层服务，SSD存储 |
| PostgreSQL/PostGIS | 4核CPU / 16GB内存 | GIS数据存储，SSD |
| Redis | 2核 / 4GB | 缓存+会话，Redis Cluster |
| RabbitMQ | 2核 / 4GB | 消息队列 |

### 9.3 环境配置（application.yml）

```yaml
server:
  port: 8080

spring:
  application:
    name: gis-bff

  rabbitmq:
    host: ${RABBITMQ_HOST}
    port: 5672
    username: ${RABBITMQ_USER}
    password: ${RABBITMQ_PASS}

  redis:
    host: ${REDIS_HOST}
    port: 6379
    password: ${REDIS_PASS}
    lettuce:
      pool:
        max-active: 50
        max-idle: 10

  datasource:
    url: jdbc:postgresql://${POSTGRES_HOST}:5432/gis?currentSchema=public
    username: ${POSTGRES_USER}
    password: ${POSTGRES_PASS}

# 高德API配置
amap:
  api-key: ${AMAP_API_KEY}
  traffic-interval-ms: 30000

# GeoServer配置（前端直连，此处仅供BFF查询元数据用）
geoserver:
  base-url: ${GEOSERVER_URL}
  workspace: firefighting

# WebSocket配置
ws:
  heartbeat-interval-ms: 15000
  reconnect-timeout-ms: 3000

# MQ Topic配置
mq:
  queues:
    alarm-events: gis.alarm.event.queue
    vehicle-events: gis.vehicle.event.queue
    dispatch-events: gis.dispatch.event.queue
```

---

## 十、可观测性设计

### 10.1 关键指标（Prometheus Metrics）

| 指标名 | 类型 | 描述 | 告警阈值 |
|--------|------|------|---------|
| `gis_scene_init_duration_seconds` | Histogram | 场景初始化耗时 | P99 > 1500ms |
| `gis_mq_message_process_duration_seconds` | Histogram | MQ消息处理延迟 | P99 > 500ms |
| `gis_ws_active_connections` | Gauge | WebSocket活跃连接数 | <2 或 >上限×0.9 |
| `gis_amap_api_failure_total` | Counter | 高德API调用失败次数 | 失败率 > 1% |
| `gis_geoserver_wfs_duration_seconds` | Histogram | GeoServer WFS响应时间 | P99 > 2000ms |
| `gis_vehicle_position_updates_total` | Counter | 车辆位置更新推送次数 | — |

### 10.2 日志规范

```
字段：timestamp / level / trace_id / scene / operator_id / incident_id / action / duration_ms / status
格式：JSON（Logback + ELK）
trace_id贯穿一次完整请求链路
```

### 10.3 链路追踪（OpenTelemetry）

```
前端请求 → GIS-BFF HTTP入口 → SceneService.initScene()
     ↓
  LayerMetaService → GeoServer WFS查询
     ↓
  AlarmClient / VehicleClient → 下游DDD服务
     ↓
  VehicleEventConsumer → MQ事件消费 → GisEventPublisher → WebSocket推送
```

### 10.4 健康检查

```java
@Component
public class GisBffHealthIndicator implements HealthIndicator {

    @Autowired private RedisTemplate<String, Object> redisTemplate;
    @Autowired private RabbitTemplate rabbitTemplate;

    @Override
    public Health health() {
        int up = 0, total = 3;

        // Redis
        try { redisTemplate.getConnectionFactory().getConnection().ping(); up++; }
        catch (Exception e) { log.warn("Redis不可用", e); }

        // RabbitMQ
        try { rabbitTemplate.execute(channel -> { channel.basicQos(1); return null; }); up++; }
        catch (Exception e) { log.warn("RabbitMQ不可用", e); }

        // 自身线程池
        if (up == total) return Health.up().build();
        return Health.down().detail("Redis或MQ不可用").build();
    }
}
```

---

## 十一、后续工作项

- [ ] 与GIS团队确认 `gis:env_micro_fence` 等待确认视图名的实际值
- [ ] 与高德/第三方确认路况API接入规格和配额
- [ ] 与移动指挥模块确认车辆主动上报MQ协议
- [ ] 与调派模块确认"等待确认"状态定义
- [ ] 与UI团队确认2D/3D切换技术方案和图标资源
- [ ] 性能压测：200坐席并发下场景初始化P99 ≤ 1500ms
- [ ] 故障演练：BFF单节点挂掉后前端降级验证
- [ ] Redis集群高可用验证
- [ ] 消息队列持久化+死信队列配置验证
