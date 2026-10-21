<script setup lang="ts">
import { ROUTE_PREFERENCE_LABELS, type RoutePreference, type StationRouteAlternatives } from '../amap/routeAlternatives';

defineProps<{ stations: StationRouteAlternatives[]; loading: boolean }>();
defineEmits<{ select: [stationId: string, routeId: string] }>();

const routeColorClass = (preferences: RoutePreference[]) => {
  if (preferences.includes('fastest')) return 'fastest';
  if (preferences.includes('shortest')) return 'shortest';
  if (preferences.includes('balanced')) return 'balanced';
  return 'alternative';
};
</script>

<template>
  <aside class="dispatch-route-panel" aria-label="各队站路线预览" @pointerdown.stop @wheel.stop>
    <header><span class="route-symbol">♧</span> 接警处置台路线预览</header>
    <div class="station-list">
      <section v-for="station in stations" :key="station.stationId" class="station-route-group">
        <div class="station-title">起点：{{ station.stationName }}<span> · 终点：当前警情点</span></div>
        <p v-if="loading && !station.alternatives.length" class="route-loading" role="status">正在获取候选路线…</p>
        <p v-else-if="station.error" class="route-error">{{ station.error }}</p>
        <div v-else role="radiogroup" :aria-label="`${station.stationName}路线选择`">
          <button
            v-for="(route, index) in station.alternatives"
            :key="route.id"
            type="button"
            role="radio"
            :aria-checked="station.selectedId === route.id"
            :class="['route-choice', routeColorClass(route.preferences), { selected: station.selectedId === route.id }]"
            @click="$emit('select', station.stationId, route.id)"
          >
            <span class="route-label"
              ><i />{{ route.preferences.length ? route.preferences.map(key => ROUTE_PREFERENCE_LABELS[key]).join(' / ') : `备选路线 ${index + 1}` }}</span
            >
            <span class="route-metrics"
              >{{ Math.ceil(route.etaSeconds / 60) }} 分钟 ·
              {{ (route.result.distanceMeters / 1000).toFixed(1) }} km</span
            >
          </button>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.dispatch-route-panel { position:absolute; right:20px; bottom:20px; z-index:101; width:min(360px, calc(100% - 40px)); max-height:min(560px, calc(100% - 40px)); box-sizing:border-box; color:var(--text-primary); background:var(--panel-bg); border:1px solid var(--panel-border); border-radius:8px; box-shadow:0 8px 24px color-mix(in srgb, #000 27%, transparent); font-size:12px; overflow:hidden; }
header { display:flex; gap:7px; align-items:center; padding:12px 14px 10px; border-bottom:1px solid var(--panel-border); font-size:15px; font-weight:700; }
.route-symbol { color:var(--tag-success-text); }
.station-list { max-height:500px; overflow-y:auto; scrollbar-width:thin; scrollbar-color:var(--text-muted) transparent; }
.station-route-group { padding:10px 14px 11px; }
.station-route-group + .station-route-group { border-top:1px solid var(--panel-border); }
.station-title { margin:0 0 6px; line-height:1.5; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.station-title span { color:var(--text-muted); }
.route-choice { width:100%; min-height:30px; display:flex; justify-content:space-between; align-items:center; gap:8px; padding:6px 7px; margin:2px 0; border:1px solid transparent; border-radius:5px; background:transparent; color:var(--text-primary); cursor:pointer; text-align:left; font:inherit; }
.route-choice:hover { background:var(--card-border); }
.route-choice.selected { border-color:var(--accent-cyan); background:var(--panel-bg-solid); }
.route-choice:focus-visible { outline:2px solid var(--accent-cyan-strong); outline-offset:1px; }
.route-label { display:flex; align-items:center; gap:6px; font-weight:600; }
.route-label i { flex-shrink:0; width:8px; height:8px; border-radius:50%; background:currentColor; }
.fastest .route-label { color:var(--tag-success-text); }
.shortest .route-label { color:var(--tag-warning-text); }
.balanced .route-label { color:var(--accent-cyan); }
.alternative .route-label { color:var(--accent-cyan); }
.route-metrics { flex-shrink:0; font-size:12px; }
.route-loading { color:var(--text-muted); margin:5px 0 1px; }
.route-error { color:var(--tag-warning-text); margin:5px 0 1px; }
</style>
