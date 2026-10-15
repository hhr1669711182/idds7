const WebSocket = require("ws");

const { server, registerPlan } = require("./mock-dispatch.cjs");
const wss = new WebSocket.Server({ server });
server.listen(Number(process.env.MOCK_PORT || 18080), "127.0.0.1");

const stageReceivers = new Set();
let currentStage = null;
const intervalSetting = Number(process.env.MOCK_MESSAGE_INTERVAL_MS || 3000);
const MESSAGE_INTERVAL_MS = Number.isFinite(intervalSetting) && intervalSetting >= 1000
  ? intervalSetting : 3000;

console.log("Mock WebSocket Server started:");
console.log("ws://localhost:18080/message-client/ws/{client}/{userId}/{sessionState}");

wss.on("connection", (ws, request) => {
  const pathname = new URL(request.url, "ws://localhost:18080").pathname;
  if (pathname === '/mock-control') {
    ws.on('message', raw => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.action !== 'mock-stage' || !['onDuty', 'popup', 'inquiry', 'dispatch', 'dispatchTrack', 'logout'].includes(message.stage)) return;
        if (message.stage === 'dispatch' && (typeof message.incidentId !== 'string' || !message.incidentId.trim())) return;
        currentStage = { stage: message.stage, incidentId: message.incidentId };
        stageReceivers.forEach(receive => receive(currentStage));
        ws.send(JSON.stringify({ action: 'mock-stage-ack', stage: message.stage, clients: stageReceivers.size }));
      } catch { ws.send(JSON.stringify({ error: '无效模拟状态消息' })); }
    });
    return;
  }
  const match = pathname.match(
    /^\/message-client\/ws\/([^/]+)\/([^/]+)\/([^/]+)$/
  );

  if (!match) {
    console.warn(`拒绝连接：WebSocket 地址格式不正确 ${pathname}`);
    ws.close(1008, "Invalid WebSocket path");
    return;
  }

  const [, rawClient, rawUserId, rawSessionState] = match;
  const client = decodeURIComponent(rawClient);
  const userId = decodeURIComponent(rawUserId);
  const sessionState = decodeURIComponent(rawSessionState);

  console.log("前端已连接", { client, userId, sessionState });

  const testId = Date.now();
  const callId = `CALL-${testId}`;
  const inquiryId = `INQ-${testId}`;
  let incidentId = `INC-${testId}`;
  let dispatchContext = registerPlan(incidentId);
  const longitude = 113.956;
  const latitude = 22.54;
  const address = "深圳市南山区联调测试地址";

  const send = (message, description) => {
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`跳过 ${description}：WebSocket 已断开`);
      return;
    }
    ws.send(JSON.stringify(message));
    console.log(`已推送 ${description}`);
  };

  let ready = false;
  let sequence = 0;
  let loopTimer = null;
  let loopIndex = 0;
  const subscriptionKeys = new Set();

  const sendPosition = () => {
      const positionContent = JSON.stringify({
        taskType: "weizhiwang",
        time: new Date().toLocaleString("sv-SE", { hour12: false }),
        eventid: callId,
        lng: longitude,
        lat: latitude,
        tel: "13800138000",
        ostype: "android",
        latLngType: "WZWDW-GPS",
        address
      });

      send({
        userMsgBodyList: [
          {
            content: positionContent,
            receives: [],
            topics: [
              { type: "CUSTOM", key: "broadcast-all" },
              { type: "SEAT", key: "8001" }
            ],
            clientDto: { code: "ids-position-client", desc: "位置网对接中间件" },
            notifyTypeDto: { notifyType: "POSITION_SYNC", notifySubType: "sync" },
            request: { channel: "WEBSOCKET" }
          },
          {
            content: positionContent,
            receives: [],
            topics: [
              { type: "CUSTOM", key: "broadcast-all" },
              { type: "SEAT", key: "8001" }
            ],
            clientDto: { code: "ids-position-client", desc: "位置网对接中间件" },
            notifyTypeDto: { notifyType: "POSITION_SYNC", notifySubType: "sync" },
            request: { channel: "MESSAGE_CENTER" }
          }
        ]
      }, "POSITION_SYNC（来电定位）");
    };

  const sendAnswer = () => {
      send({
        id: `RECORD-CALL-${testId}-${++sequence}`,
        client: "ids-seat-web",
        sender: "ids-alarm-access-client",
        receives: [userId],
        topics: [{
          type: "CUSTOM",
          customType: "ALARM_CALL",
          key: "ANSWER_STATUS_CHANGED",
          exclusion: false
        }],
        notifyType: "alarm_call",
        notifySubType: "answer_status_changed",
        title: "来电报警接听状态更新",
        content: "来电报警接听状态更新",
        customContent: {
            eventId: `CALL-EVENT-${testId}-${sequence}`,
          eventName: "AlarmCallAnswerStatusChanged",
          source: "ids-alarm-access-client",
          data: {
            callId,
            previousState: "DISPLAY_RENDERED",
            newState: "ANSWERED",
            answered: true,
            ended: false,
            changedAt: new Date().toISOString(),
            channel: "CTI"
          }
        }
      }, "ANSWER_STATUS_CHANGED（进入问询）");
    };

  const sendFiling = () => {
      const eventId = `ALARM-${testId}-${++sequence}`;
      const changedAt = new Date().toLocaleString("sv-SE", { hour12: false });

      send({
        id: `RECORD-INCIDENT-${testId}-${sequence}`,
        client: "ids-seat-web",
        sender: "system",
        topics: [{
          type: "CUSTOM",
          customType: "ALARM_INCIDENT",
          key: "STATE_CHANGED",
          exclusion: false
        }],
        notifyType: "alarm_incident",
        notifySubType: "state_changed",
        title: "警情状态更新",
        content: "警情状态更新",
        customContent: {
          eventId,
          eventName: "AlarmIncidentStateChangedEvent",
          source: "ids-alarm-client",
          data: {
            incidentId,
            previousState: null,
            previousStateName: null,
            newState: "CREATED",
            newStateName: "立案",
            inquiryIds: [inquiryId],
            primaryIncidentId: incidentId,
            changedAt,
            dataSource: "INQUIRY_MODULE",
            sourceId: eventId,
            reconciliation: false,
            ext: {
              ...dispatchContext,
              callId,
              alarmAddr: { fullAddr: address, longitude, latitude }
            }
          }
        }
      }, "STATE_CHANGED / CREATED（进入调派）");
    };

  const receiveStage = (message) => {
    if (!ready || !message) return;
    console.log('测试页状态已变化', message.stage);
    if (message.stage === 'popup') sendPosition();
    if (message.stage === 'inquiry') sendAnswer();
    if (message.stage === 'dispatch') {
      if (incidentId !== message.incidentId) {
        incidentId = message.incidentId;
        dispatchContext = registerPlan(incidentId);
      }
      sendFiling();
    }
  };
  stageReceivers.add(receiveStage);

  const sendNext = () => {
    if (!ready || ws.readyState !== WebSocket.OPEN) return;
    // 控制页用于同步警情 ID；循环本身不受测试页状态限制，由前端过滤。
    if (currentStage?.stage === 'dispatch' && incidentId !== currentStage.incidentId) {
      incidentId = currentStage.incidentId;
      dispatchContext = registerPlan(incidentId);
    }
    [sendPosition, sendAnswer, sendFiling][loopIndex]();
    loopIndex = (loopIndex + 1) % 3;
  };

  ws.on("message", (message) => {
    const msg = message.toString();
    console.log("收到前端消息:", msg);

    if (msg === "ping") {
      ws.send("pong");
      console.log("返回心跳: pong");
      return;
    }

    try {
      const parsed = JSON.parse(msg);
      if (parsed?.action === "subscribe") {
        subscriptionKeys.add(`${parsed.type}:${parsed.customType || ""}:${parsed.key}`);
        const subscribed = subscriptionKeys.has("SEAT::8001")
          && subscriptionKeys.has("CUSTOM:ALARM_CALL:ANSWER_STATUS_CHANGED")
          && subscriptionKeys.has("CUSTOM:ALARM_INCIDENT:STATE_CHANGED");
        if (subscribed && !ready) {
          ready = true;
          console.log(`三条订阅已就绪，每 ${MESSAGE_INTERVAL_MS} 毫秒循环推送：定位 → 接听 → 立案`);
          sendNext();
          loopTimer = setInterval(sendNext, MESSAGE_INTERVAL_MS);
        }
      }
    } catch {
      // ping/pong 等非 JSON 帧不参与订阅判断。
    }
  });

  ws.on("close", () => {
    ready = false;
    if (loopTimer !== null) clearInterval(loopTimer);
    loopTimer = null;
    stageReceivers.delete(receiveStage);
    console.log("前端连接已关闭");
  });
});
