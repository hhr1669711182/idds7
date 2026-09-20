<!--
 * @Author: hhr
 * @Date: 2026-09-11
 * @LastEditors: hhr
 * @Description: 地址机器人(应急侦察/巡检机器人)侧边栏
 *  - 展示当前地图上 AddressRobotManager 维护的所有机器人列表
 *  - 支持搜索、选中、定位、移除
 *  - 主题色全部使用全局 CSS 变量，适配日夜主题
 * @FilePath: \ids-gis-web\src\components\AddressRobotPanel\index.vue
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

type RobotStatus = "online" | "offline" | "warning" | "alarm";

interface AddressRobotItem {
  id: string;
  name: string;
  status: RobotStatus;
  battery: number;
  signal: number;
  floor?: string;
  address?: string;
  lastReportAt: number;
  lon?: number;
  lat?: number;
  temperature?: number;
  gas?: number;
  smoke?: number;
  owner?: string;
  remark?: string;
}

const statusText: Record<RobotStatus, string> = {
  online: "在线",
  offline: "离线",
  warning: "告警",
  alarm: "火警",
};

const statusClass = (s: RobotStatus) => `addr_status addr_status_${s}`;

/** 时间格式化 */
const fmtTime = (ts: number) => {
  if (!ts) return "--";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const ago = (ts: number) => {
  if (!ts) return "--";
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  return `${Math.floor(h / 24)}天前`;
};

const batteryColor = (b: number) => {
  if (b <= 20) return "#ff4d4f";
  if (b <= 50) return "#ff9b00";
  return "#22c55e";
};

const signalIcon = (n: number) => {
  return Array.from({ length: 4 })
    .map((_, i) => `<i class="bar${i < n ? " on" : ""}"></i>`)
    .join("");
};

/** 假数据（开发期演示） */
const list = ref<AddressRobotItem[]>([
  {
    id: "RB-001",
    name: "侦察机器人 1 号",
    status: "online",
    battery: 86,
    signal: 4,
    floor: "F-12",
    address: "福田区福华路 88 号",
    lastReportAt: Date.now() - 5 * 1000,
    lon: 114.054,
    lat: 22.542,
    temperature: 38.6,
    gas: 22,
    smoke: 0.08,
    owner: "李志远",
    remark: "前哨侦察点，视野良好",
  },
  {
    id: "RB-002",
    name: "侦察机器人 2 号",
    status: "warning",
    battery: 42,
    signal: 3,
    floor: "F-08",
    address: "福田区福华路 88 号",
    lastReportAt: Date.now() - 32 * 1000,
    lon: 114.057,
    lat: 22.541,
    temperature: 56.2,
    gas: 89,
    smoke: 0.32,
    owner: "王晓晨",
    remark: "检测到可燃气体上升",
  },
  {
    id: "RB-003",
    name: "侦察机器人 3 号",
    status: "alarm",
    battery: 23,
    signal: 2,
    floor: "F-15",
    address: "福田区福华路 88 号",
    lastReportAt: Date.now() - 12 * 1000,
    lon: 114.055,
    lat: 22.543,
    temperature: 78.5,
    gas: 152,
    smoke: 0.74,
    owner: "陈安",
    remark: "火警！立即撤离",
  },
  {
    id: "RB-004",
    name: "巡检机器人 A",
    status: "online",
    battery: 67,
    signal: 3,
    floor: "B1",
    address: "福田区福华路 88 号",
    lastReportAt: Date.now() - 78 * 1000,
    lon: 114.056,
    lat: 22.544,
    temperature: 24.1,
    gas: 5,
    smoke: 0.02,
    owner: "赵敏",
  },
  {
    id: "RB-005",
    name: "巡检机器人 B",
    status: "offline",
    battery: 0,
    signal: 0,
    floor: "F-03",
    address: "福田区福华路 88 号",
    lastReportAt: Date.now() - 26 * 60 * 1000,
    owner: "周林",
    remark: "信号丢失",
  },
]);

const collapsed = ref(false);
const keyword = ref("");
const selectedId = ref<string>("");

/** 过滤 */
const filteredList = computed(() => {
  const k = keyword.value.trim().toLowerCase();
  if (!k) return list.value;
  return list.value.filter(
    (it) =>
      (it.name || "").toLowerCase().includes(k) ||
      (it.id || "").toLowerCase().includes(k) ||
      (it.address || "").toLowerCase().includes(k) ||
      (it.owner || "").toLowerCase().includes(k),
  );
});

/** 统计 */
const statistics = computed(() => {
  const total = list.value.length;
  let online = 0, offline = 0, warning = 0, alarm = 0;
  for (const it of list.value) {
    if (it.status === "online") online++;
    else if (it.status === "offline") offline++;
    else if (it.status === "warning") warning++;
    else if (it.status === "alarm") alarm++;
  }
  return { total, online, offline, warning, alarm };
});

/** 当前选中 */
const selected = computed(
  () => list.value.find((it) => it.id === selectedId.value) || null,
);

/** 选中 */
const onPick = (id: string) => {
  selectedId.value = id;
};

const onLocate = (item: AddressRobotItem) => {
  // TODO: 真实场景下触发地图飞行定位
  console.log("[AddressRobotPanel] locate", item.id);
};

const onRemove = (id: string) => {
  list.value = list.value.filter((it) => it.id !== id);
  if (selectedId.value === id) selectedId.value = "";
};

const onRefresh = () => {
  // TODO: 真实场景下请求后端拉新
  console.log("[AddressRobotPanel] refresh");
};

const toggleCollapsed = () => {
  collapsed.value = !collapsed.value;
};

/** 模拟实时数据更新（仅假数据演示） */
let mockTimer: number | null = null;
onMounted(() => {
  mockTimer = window.setInterval(() => {
    const arr = list.value;
    if (!arr.length) return;
    const item = arr[Math.floor(Math.random() * arr.length)];
    const delta = (Math.random() - 0.5) * 10;
    item.battery = Math.max(
      0,
      Math.min(100, Math.round((item.battery ?? 80) + delta / 2)),
    );
    item.temperature = Math.max(20, +((item.temperature ?? 30) + delta / 4).toFixed(1));
    item.lastReportAt = Date.now();
  }, 3000);
});

onBeforeUnmount(() => {
  if (mockTimer !== null) {
    window.clearInterval(mockTimer);
    mockTimer = null;
  }
});

const nowStr = computed(() => fmtTime(Date.now()));
</script>

<template>
  <div :class="['addr_panel', { collapsed }]">
    <!-- 头部 -->
    <div class="addr_header">
      <div class="addr_title">
        <span class="addr_dot"></span>
        <span>地址机器人</span>
        <span class="addr_total">{{ statistics.total }}</span>
      </div>
      <div class="addr_actions">
        <span class="addr_icon_btn" title="刷新" @click="onRefresh">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M17.65 6.35A8 8 0 0 0 4 12h-2l3.5 4 3.5-4H6a6 6 0 1 1 1.76 4.24l-1.42 1.42A8 8 0 1 0 17.65 6.35z" />
          </svg>
        </span>
        <span class="addr_icon_btn" :title="collapsed ? '展开' : '折叠'" @click="toggleCollapsed">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path v-if="!collapsed" d="M7 10l5 5 5-5z" />
            <path v-else d="M7 14l5-5 5 5z" />
          </svg>
        </span>
      </div>
    </div>

    <!-- 主体 -->
    <div v-show="!collapsed" class="addr_body">
      <!-- 统计卡 -->
      <div class="addr_stats">
        <div class="stat">
          <div class="stat_num">{{ statistics.total }}</div>
          <div class="stat_lbl">总数</div>
        </div>
        <div class="stat">
          <div class="stat_num ok">{{ statistics.online }}</div>
          <div class="stat_lbl">在线</div>
        </div>
        <div class="stat">
          <div class="stat_num warn">{{ statistics.warning }}</div>
          <div class="stat_lbl">告警</div>
        </div>
        <div class="stat">
          <div class="stat_num err">{{ statistics.alarm }}</div>
          <div class="stat_lbl">火警</div>
        </div>
      </div>

      <!-- 搜索 -->
      <div class="addr_search">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" class="addr_search_icon">
          <path d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z" />
        </svg>
        <input
          v-model="keyword"
          class="addr_search_input"
          type="text"
          placeholder="搜索编号/名称/地址"
        />
      </div>

      <!-- 列表 -->
      <div class="addr_list">
        <div
          v-for="it in filteredList"
          :key="it.id"
          :class="['addr_item', { active: selected && selected.id === it.id }]"
          @click="onPick(it.id)"
        >
          <div class="addr_item_top">
            <span :class="statusClass(it.status)">
              <span class="dot"></span>
              {{ statusText[it.status] }}
            </span>
            <span class="addr_item_name">{{ it.name }}</span>
            <span class="addr_item_id">{{ it.id }}</span>
          </div>
          <div class="addr_item_meta">
            <span v-if="it.floor" class="addr_item_floor">{{ it.floor }}</span>
            <span class="addr_item_addr" :title="it.address">{{ it.address || "--" }}</span>
          </div>
          <div class="addr_item_bot">
            <div class="addr_item_battery" :title="'电量 ' + (it.battery ?? 0) + '%'">
              <div class="addr_battery_bar">
                <div
                  class="addr_battery_fill"
                  :style="{
                    width: (it.battery ?? 0) + '%',
                    background: batteryColor(it.battery ?? 0),
                  }"
                ></div>
              </div>
              <span class="addr_battery_pct">{{ it.battery ?? 0 }}%</span>
            </div>
            <span class="addr_item_signal" v-html="signalIcon(it.signal ?? 0)"></span>
            <span class="addr_item_ago">{{ ago(it.lastReportAt) }}</span>
          </div>
        </div>

        <div v-if="!filteredList.length" class="addr_empty">
          <div class="addr_empty_icon">📡</div>
          <div class="addr_empty_text">暂无机器人数据</div>
        </div>
      </div>

      <!-- 详情 -->
      <transition name="addr_fade">
        <div v-if="selected" class="addr_detail">
          <div class="addr_detail_header">
            <div>
              <div class="addr_detail_title">{{ selected.name }}</div>
              <div class="addr_detail_sub">
                {{ selected.id }} · {{ selected.owner || "未指派" }}
              </div>
            </div>
            <div class="addr_detail_btns">
              <button class="addr_btn addr_btn_primary" @click="onLocate(selected)">
                定位
              </button>
              <button class="addr_btn" @click="onRemove(selected.id)">
                移除
              </button>
            </div>
          </div>

          <div class="addr_video">
            <div class="addr_video_placeholder">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" opacity="0.55">
                <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
              </svg>
              <span>实时视频</span>
            </div>
            <div class="addr_video_overlay">
              <span :class="statusClass(selected.status)">
                <span class="dot"></span>
                {{ statusText[selected.status] }}
              </span>
              <span>{{ fmtTime(selected.lastReportAt) }}</span>
            </div>
          </div>

          <div class="addr_field">
            <span class="lbl">当前地址</span>
            <span class="val">{{ selected.address || "--" }}</span>
          </div>
          <div class="addr_field">
            <span class="lbl">楼层</span>
            <span class="val">{{ selected.floor || "--" }}</span>
          </div>
          <div class="addr_field">
            <span class="lbl">经纬度</span>
            <span class="val mono">
              {{ selected.lon?.toFixed(5) ?? "--" }},
              {{ selected.lat?.toFixed(5) ?? "--" }}
            </span>
          </div>

          <div class="addr_sensors">
            <div class="sensor">
              <div class="sensor_label">温度</div>
              <div class="sensor_value">
                {{ selected.temperature?.toFixed(1) ?? "--" }}
                <span class="sensor_unit">℃</span>
              </div>
              <div class="sensor_bar">
                <div
                  class="sensor_fill"
                  :style="{
                    width: Math.min(100, ((selected.temperature ?? 0) / 100) * 100) + '%',
                    background:
                      (selected.temperature ?? 0) > 60
                        ? '#ff4d4f'
                        : (selected.temperature ?? 0) > 45
                          ? '#ff9b00'
                          : '#22c55e',
                  }"
                ></div>
              </div>
            </div>
            <div class="sensor">
              <div class="sensor_label">可燃气体</div>
              <div class="sensor_value">
                {{ selected.gas ?? "--" }}
                <span class="sensor_unit">ppm</span>
              </div>
              <div class="sensor_bar">
                <div
                  class="sensor_fill"
                  :style="{
                    width: Math.min(100, ((selected.gas ?? 0) / 200) * 100) + '%',
                    background:
                      (selected.gas ?? 0) > 100
                        ? '#ff4d4f'
                        : (selected.gas ?? 0) > 50
                          ? '#ff9b00'
                          : '#22c55e',
                  }"
                ></div>
              </div>
            </div>
            <div class="sensor">
              <div class="sensor_label">烟雾</div>
              <div class="sensor_value">
                {{ selected.smoke?.toFixed(2) ?? "--" }}
                <span class="sensor_unit">%</span>
              </div>
              <div class="sensor_bar">
                <div
                  class="sensor_fill"
                  :style="{
                    width: Math.min(100, ((selected.smoke ?? 0) / 1) * 100) + '%',
                    background:
                      (selected.smoke ?? 0) > 0.5
                        ? '#ff4d4f'
                        : (selected.smoke ?? 0) > 0.2
                          ? '#ff9b00'
                          : '#22c55e',
                  }"
                ></div>
              </div>
            </div>
            <div class="sensor">
              <div class="sensor_label">电量</div>
              <div class="sensor_value">
                {{ selected.battery ?? "--" }}
                <span class="sensor_unit">%</span>
              </div>
              <div class="sensor_bar">
                <div
                  class="sensor_fill"
                  :style="{
                    width: (selected.battery ?? 0) + '%',
                    background: batteryColor(selected.battery ?? 0),
                  }"
                ></div>
              </div>
            </div>
          </div>

          <div v-if="selected.remark" class="addr_remark">
            备注：{{ selected.remark }}
          </div>

          <div class="addr_footer">
            <span>系统时间 {{ nowStr }}</span>
            <span>演示数据</span>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped lang="less">
.addr_panel {
  position: absolute;
  right: 16px;
  top: 90px;
  bottom: 50px;
  width: 360px;
  max-width: calc(100vw - 32px);
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  box-shadow: var(--panel-shadow);
  display: flex;
  flex-direction: column;
  z-index: 5;
  overflow: hidden;
  color: var(--text-primary);
  transition: width 0.25s ease;
  backdrop-filter: blur(4px);

  &.collapsed {
    width: 220px;
  }
}

/* ============ 头部 ============ */
.addr_header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  height: 42px;
  background: var(--header-bg);
  color: var(--header-text);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
  flex-shrink: 0;
}

.addr_title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.addr_dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.85);
  animation: addr_pulse 1.6s infinite ease-in-out;
}

@keyframes addr_pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
}

.addr_total {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: 10px;
  margin-left: 2px;
  letter-spacing: 0;
}

.addr_actions {
  display: flex;
  gap: 4px;
}
.addr_icon_btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  color: var(--header-text);
  cursor: pointer;
  transition: background 0.15s;
  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }
}

/* ============ 主体 ============ */
.addr_body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* ============ 统计卡 ============ */
.addr_stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--primary-li-bottom-color);
  background: var(--widget-bg);

  .stat {
    text-align: center;
    padding: 6px 4px;
    border-radius: 6px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    transition: all 0.2s;
  }
  .stat:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }
  .stat_num {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'Consolas', monospace;
    line-height: 1.2;
  }
  .stat_num.ok { color: #22c55e; }
  .stat_num.warn { color: #ff9b00; }
  .stat_num.err { color: #ff4d4f; }
  .stat_lbl {
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 2px;
    letter-spacing: 0.5px;
  }
}

/* ============ 搜索 ============ */
.addr_search {
  position: relative;
  margin: 10px 12px 6px;
  flex-shrink: 0;
}
.addr_search_icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
}
.addr_search_input {
  width: 100%;
  height: 30px;
  padding: 0 10px 0 28px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}
.addr_search_input:focus {
  border-color: var(--accent-cyan);
  box-shadow: 0 0 0 2px rgba(51, 133, 255, 0.18);
}
.addr_search_input::placeholder {
  color: var(--text-muted);
}

/* ============ 列表 ============ */
.addr_list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 10px 8px;
  min-height: 120px;
  max-height: 45%;
}

.addr_item {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--accent-cyan);
    transform: translateX(2px);
  }

  &.active {
    border-color: var(--accent-cyan);
    box-shadow: 0 0 0 2px rgba(51, 133, 255, 0.18);
    background: var(--active-bg);
  }
}

.addr_item_top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.addr_item_name {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.addr_item_id {
  font-size: 10px;
  color: var(--text-muted);
  font-family: 'Consolas', monospace;
}

.addr_item_meta {
  display: flex;
  gap: 6px;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.addr_item_floor {
  background: var(--accent-cyan-soft);
  color: var(--accent-cyan);
  padding: 0 6px;
  border-radius: 3px;
  font-family: 'Consolas', monospace;
  font-weight: 600;
}
.addr_item_addr {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.addr_item_bot {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
}

.addr_item_battery {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}
.addr_battery_bar {
  flex: 1;
  height: 4px;
  background: var(--primary-li-bottom-color);
  border-radius: 2px;
  overflow: hidden;
}
.addr_battery_fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s;
}
.addr_battery_pct {
  font-family: 'Consolas', monospace;
  font-size: 10px;
  color: var(--text-secondary);
  min-width: 28px;
  text-align: right;
}

.addr_item_signal {
  display: inline-flex;
  align-items: flex-end;
  gap: 1px;
  height: 12px;

  .bar {
    width: 3px;
    background: var(--primary-li-bottom-color);
    border-radius: 1px;
  }
  .bar:nth-child(1) { height: 4px; }
  .bar:nth-child(2) { height: 7px; }
  .bar:nth-child(3) { height: 10px; }
  .bar:nth-child(4) { height: 13px; }
  .bar.on {
    background: var(--accent-cyan);
  }
}

.addr_item_ago {
  font-family: 'Consolas', monospace;
  font-size: 10px;
}

/* ============ 状态徽章 ============ */
.addr_status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  letter-spacing: 0.5px;

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
}
.addr_status_online  { color: #22c55e; background: rgba(34, 197, 94, 0.14); }
.addr_status_offline { color: #888;     background: rgba(136, 136, 136, 0.18); }
.addr_status_warning { color: #ff9b00; background: rgba(255, 155, 0, 0.16); }
.addr_status_alarm   { color: #ff4d4f; background: rgba(255, 77, 79, 0.16); animation: addr_blink 1s infinite; }

@keyframes addr_blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

/* ============ 空 ============ */
.addr_empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  color: var(--text-muted);
  font-size: 12px;
  gap: 8px;
}
.addr_empty_icon {
  font-size: 28px;
  opacity: 0.6;
}

/* ============ 详情 ============ */
.addr_detail {
  flex-shrink: 0;
  max-height: 55%;
  border-top: 1px solid var(--primary-li-bottom-color);
  background: var(--widget-bg);
  overflow-y: auto;
  padding: 10px 12px 6px;
}

.addr_detail_header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
}
.addr_detail_title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}
.addr_detail_sub {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}
.addr_detail_btns {
  display: flex;
  gap: 4px;
}
.addr_btn {
  height: 24px;
  padding: 0 10px;
  font-size: 11px;
  border-radius: 4px;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    color: var(--accent-cyan);
    border-color: var(--accent-cyan);
  }
}
.addr_btn_primary {
  background: var(--active-bg);
  color: var(--accent-cyan);
  border-color: var(--accent-cyan);
  font-weight: 600;
  &:hover {
    background: var(--accent-cyan);
    color: #fff;
  }
}

/* ============ 视频占位 ============ */
.addr_video {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, #0d1322 0%, #1a2236 100%);
  border-radius: 6px;
  border: 1px solid var(--card-border);
  overflow: hidden;
  margin-bottom: 8px;
}
.addr_video_placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 11px;
}
.addr_video_overlay {
  position: absolute;
  top: 4px;
  left: 4px;
  right: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  font-family: 'Consolas', monospace;
}

/* ============ 字段 ============ */
.addr_field {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--primary-li-bottom-color);

  .lbl {
    color: var(--text-muted);
  }
  .val {
    color: var(--text-primary);
    font-weight: 500;
    max-width: 70%;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mono {
    font-family: 'Consolas', monospace;
  }
}

/* ============ 传感器 ============ */
.addr_sensors {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;

  .sensor {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 4px;
    padding: 6px 8px;
  }
  .sensor_label {
    font-size: 10px;
    color: var(--text-muted);
  }
  .sensor_value {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'Consolas', monospace;
    margin-top: 2px;
    line-height: 1.1;
  }
  .sensor_unit {
    font-size: 10px;
    color: var(--text-muted);
    font-weight: 400;
    margin-left: 2px;
  }
  .sensor_bar {
    height: 3px;
    background: var(--primary-li-bottom-color);
    border-radius: 2px;
    margin-top: 4px;
    overflow: hidden;
  }
  .sensor_fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.4s;
  }
}

.addr_remark {
  margin-top: 8px;
  padding: 6px 8px;
  background: var(--accent-cyan-soft);
  border-left: 3px solid var(--accent-cyan);
  color: var(--text-secondary);
  font-size: 11px;
  border-radius: 3px;
}

.addr_footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 10px;
  color: var(--text-muted);
  font-family: 'Consolas', monospace;
}

/* ============ 过渡 ============ */
.addr_fade-enter-active,
.addr_fade-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.addr_fade-enter-from,
.addr_fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ============ 滚动条 ============ */
.addr_list::-webkit-scrollbar,
.addr_detail::-webkit-scrollbar {
  width: 4px;
}
.addr_list::-webkit-scrollbar-thumb,
.addr_detail::-webkit-scrollbar-thumb {
  background: var(--primary-li-bottom-color);
  border-radius: 2px;
}
.addr_list::-webkit-scrollbar-thumb:hover,
.addr_detail::-webkit-scrollbar-thumb:hover {
  background: var(--accent-cyan-soft);
}

/* ============ 夜间主题 ============ */
html[data-theme='NIGHT'] {
  .addr_panel {
    backdrop-filter: blur(8px);
  }
  .addr_video {
    background: linear-gradient(135deg, #050a14 0%, #0d1322 100%);
  }
  .addr_detail {
    background: rgba(13, 19, 34, 0.7);
  }
}

/* ============ 折叠态 ============ */
.addr_panel.collapsed .addr_body {
  display: none;
}
.addr_panel.collapsed .addr_total {
  margin-left: auto;
}

/* ============ 窄屏 ============ */
@media (max-width: 1280px) {
  .addr_panel {
    width: 320px;
  }
}
@media (max-width: 1024px) {
  .addr_panel {
    width: 290px;
    right: 8px;
  }
}
</style>
