<!--
 * @Author: hhr
 * @Date: 2026-08-27 10:09:42
 * @LastEditTime: 2026-08-27 16:26:03
 * @LastEditors: hhr
 * @Description: amapApi 13 接口调试面板（ids-address-query-client）
 * @FilePath: \ids-gis-web\src\views\amap\AmapApiDemo.vue
-->
<template>
  <div class="amap-demo">
    <header class="header">
      <h2>amapApi 调试面板</h2>
      <div class="meta">
        baseURL: <code>{{ baseUrl || "(空)" }}</code>
        <span class="sep">|</span>
        token: <code>{{ tokenMasked }}</code>
      </div>
    </header>

    <main class="content">
      <section class="card">
        <h3>1. POI</h3>
        <div class="form-row">
          <label>keywords <input v-model="form.keywordSearch.keywords" placeholder="北京大学" /></label>
          <label>city <input v-model="form.keywordSearch.city" placeholder="北京" /></label>
          <button class="primary" @click="call('keywordSearch')">keywordSearch</button>
        </div>
        <div class="form-row">
          <label>location <input v-model="form.aroundSearch.location" placeholder="116.31,39.99" /></label>
          <label>radius <input v-model.number="form.aroundSearch.radius" type="number" /></label>
          <button class="primary" @click="call('aroundSearch')">aroundSearch</button>
        </div>
        <div class="form-row">
          <label>polygon <input v-model="form.polygonSearch.polygon" placeholder="lng,lat;lng,lat;..." style="min-width:280px" /></label>
          <button class="primary" @click="call('polygonSearch')">polygonSearch</button>
        </div>
        <div class="form-row">
          <label>id <input v-model="form.detail.id" placeholder="POI id" /></label>
          <button class="primary" @click="call('detail')">detail</button>
        </div>
        <div class="form-row">
          <label>tips keywords <input v-model="form.inputTips.keywords" /></label>
          <button class="primary" @click="call('inputTips')">inputTips</button>
        </div>
      </section>

      <section class="card">
        <h3>2. 地理编码</h3>
        <div class="form-row">
          <label>location <input v-model="form.regeo.location" placeholder="116.31,39.99" /></label>
          <label>extensions
            <select v-model="form.regeo.extensions">
              <option value="base">base</option>
              <option value="all">all</option>
            </select>
          </label>
          <button class="primary" @click="call('regeo')">regeo</button>
        </div>
        <div class="form-row">
          <label>address <input v-model="form.geocode.address" /></label>
          <label>city <input v-model="form.geocode.city" /></label>
          <button class="primary" @click="call('geocode')">geocode</button>
        </div>
        <div class="form-row">
          <label>address <input v-model="form.analyzeAddress.address" style="min-width:300px" /></label>
          <button class="primary" @click="call('analyzeAddress')">analyzeAddress</button>
        </div>
      </section>

      <section class="card">
        <h3>3. 路径规划</h3>
        <div class="form-row">
          <label>origin <input v-model="form.driving.origin" /></label>
          <label>destination <input v-model="form.driving.destination" /></label>
          <button class="primary" @click="call('driving')">driving</button>
          <button @click="call('drivingV2')">drivingV2</button>
        </div>
        <div class="form-row">
          <label>origins(分号分隔) <input v-model="form.multiWaypoint.originsRaw" style="min-width:260px" /></label>
          <label>destinations <input v-model="form.multiWaypoint.destinationsRaw" style="min-width:260px" /></label>
          <button class="primary" @click="call('multiWaypoint')">multiWaypoint</button>
        </div>
      </section>

      <section class="card">
        <h3>4. 天气</h3>
        <div class="form-row">
          <label>city(adcode) <input v-model="form.weather.city" placeholder="110101" /></label>
          <button class="primary" @click="call('weather')">weather</button>
        </div>
      </section>

      <section class="card full">
        <h3>结果</h3>
        <div v-if="lastError" class="error">
          <div><strong>错误</strong> · code: {{ lastError.code }} · HTTP {{ lastError.status ?? "-" }}</div>
          <div class="msg">{{ lastError.message }}</div>
        </div>
        <pre v-if="lastResult !== null">{{ formatJson(lastResult) }}</pre>
        <div v-else-if="!lastError" class="empty">点击上方按钮开始调用</div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from "vue"
import { appEnv } from "@/config/env"
import { amapApi } from "@/apis/amap"
import { AppError } from "@/service/error"

interface FormState {
  keywordSearch: { keywords: string; city: string }
  aroundSearch: { location: string; radius: number | null }
  polygonSearch: { polygon: string }
  detail: { id: string }
  inputTips: { keywords: string }
  regeo: { location: string; extensions: "base" | "all" }
  geocode: { address: string; city: string }
  analyzeAddress: { address: string }
  driving: { origin: string; destination: string }
  multiWaypoint: { originsRaw: string; destinationsRaw: string }
  weather: { city: string }
}

const form = reactive<FormState>({
  keywordSearch: { keywords: "北京大学", city: "北京" },
  aroundSearch: { location: "116.31,39.99", radius: 1000 },
  polygonSearch: { polygon: "" },
  detail: { id: "" },
  inputTips: { keywords: "" },
  regeo: { location: "116.31,39.99", extensions: "base" },
  geocode: { address: "", city: "" },
  analyzeAddress: { address: "" },
  driving: { origin: "116.481028,39.989643", destination: "116.434446,39.90816" },
  multiWaypoint: { originsRaw: "116.481028,39.989643;116.5,40.0", destinationsRaw: "116.434446,39.90816" },
  weather: { city: "110101" },
})

const baseUrl = computed(() => appEnv.amapApiBaseUrl)
const tokenMasked = computed(() => {
  const t = localStorage.getItem("access_token") || ""
  if (!t) return "(无)"
  return t.length > 16 ? `${t.slice(0, 8)}…${t.slice(-6)}` : "(已设置)"
})

const lastResult = ref<any>(null)
const lastError = ref<{ code: string; status?: number; message: string } | null>(null)

const formatJson = (v: unknown) => JSON.stringify(v, null, 2)

const call = async (key: keyof typeof amapApi) => {
  lastError.value = null
  lastResult.value = null
  try {
    let res: any
    switch (key) {
      case "keywordSearch":
        res = await amapApi.keywordSearch({ keywords: form.keywordSearch.keywords, city: form.keywordSearch.city, offset: 20, page: 1 })
        break
      case "aroundSearch":
        res = await amapApi.aroundSearch({ location: form.aroundSearch.location, radius: form.aroundSearch.radius ?? undefined })
        break
      case "polygonSearch":
        res = await amapApi.polygonSearch({ polygon: form.polygonSearch.polygon })
        break
      case "detail":
        res = await amapApi.detail({ id: form.detail.id })
        break
      case "inputTips":
        res = await amapApi.inputTips({ keywords: form.inputTips.keywords })
        break
      case "regeo":
        res = await amapApi.regeo({ location: form.regeo.location, extensions: form.regeo.extensions })
        break
      case "geocode":
        res = await amapApi.geocode({ address: form.geocode.address, city: form.geocode.city || undefined })
        break
      case "analyzeAddress":
        res = await amapApi.analyzeAddress({ address: form.analyzeAddress.address })
        break
      case "driving":
        res = await amapApi.driving({ origin: form.driving.origin, destination: form.driving.destination })
        break
      case "drivingV2":
        res = await amapApi.drivingV2({ origin: form.driving.origin, destination: form.driving.destination })
        break
      case "multiWaypoint": {
        // const origins = form.multiWaypoint.originsRaw.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
        const origins = form.multiWaypoint.originsRaw.split(/[;,]/).map((s) => s.trim()).filter(Boolean).flat()
        const destinations = form.multiWaypoint.destinationsRaw.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
        res = await amapApi.multiWaypoint({ origins, destinations })
        break
      }
      case "weather":
        res = await amapApi.weather({ city: form.weather.city })
        break
    }
    lastResult.value = res
  } catch (e: any) {
    if (e instanceof AppError) {
      lastError.value = { code: e.code, status: e.status, message: e.message }
    } else {
      lastError.value = { code: "UNKNOWN", message: String(e?.message ?? e) }
    }
  }
}
</script>

<style scoped>
.amap-demo {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f7f8fa;
  color: #222;
}
.header {
  padding: 12px 20px;
  background: #1f2937;
  color: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}
.header h2 { font-size: 16px; margin: 0; }
.meta { font-size: 12px; opacity: .85; }
.meta code { background: #111827; padding: 2px 6px; border-radius: 4px; }
.sep { margin: 0 6px; opacity: .5; }
.content {
  padding: 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  overflow: auto;
}
.card {
  background: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.card.full { grid-column: 1 / -1; }
.card h3 { font-size: 14px; margin: 0 0 10px; color: #374151; }
.form-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.form-row label { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #4b5563; }
.form-row input, .form-row select {
  padding: 4px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 12px;
  min-width: 120px;
}
button {
  padding: 4px 10px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
.card pre {
  background: #0f172a;
  color: #e2e8f0;
  padding: 10px;
  border-radius: 6px;
  font-size: 12px;
  max-height: 360px;
  overflow: auto;
  margin: 0;
}
.error {
  background: #fee2e2;
  color: #991b1b;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
}
.error .msg { margin-top: 4px; font-family: ui-monospace, monospace; }
.empty { color: #9ca3af; font-size: 12px; }
</style>