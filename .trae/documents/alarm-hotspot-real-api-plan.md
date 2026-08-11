# 警情热点图层接入真实 API 计划

## Summary

把"警情热点"图层（`gis:disaster_info`、当前 `useWebMock: true`、使用静态 `JRAlarmList` mock）改为真实 API 数据：
- 每次图层被勾选显示时，调用 `listAlarmMethod({stateFrom: 'CREATED', stateTo: 'CLOSED'})` 获取 `data.records`
- 提取 `incidentId` 集合，调用 `getAlarmAllDetailMethod(incidentIds)` 获取 `data.list`
- 将 `DisasterProfileItem[]` 映射为 `JRAlarmData[]` 渲染为矢量要素上图
- 弹窗字段、样式映射按新 API 结构更新

实现策略：**新建 composable `useAlarmHotspot` 封装两层 API 链式调用 + 映射，map.vue 只负责触发与喂数据**。保持代码优雅、最小边界影响。

---

## Current State Analysis

### 关键现状

| 位置 | 现状 |
|---|---|
| [layers.ts:70-81](file:///d:/work/telewave/ids/ids-gis-web/src/config/layers.ts#L70-L81) | `disaster_info` 配置 `useWebMock: true` |
| [map.vue:800-816](file:///d:/work/telewave/ids/ids-gis-web/src/baseComponent/OpenlayersMap/map.vue#L800-L816) | `mountJRAlarmLayer` 用静态 `JRAlarmList` 初始化 |
| [useAmapTools.ts:208-306](file:///d:/work/telewave/ids/ids-gis-web/src/baseComponent/amap/useAmapTools.ts#L208-L306) | `createJRAlarmLayer` + `mountJRAlarmLayer` 一次性构建 feature，无 `setData` |
| [mapData.ts:130-147](file:///d:/work/telewave/ids/ids-gis-web/src/baseComponent/amap/mapData.ts#L130-L147) | `JRAlarmData` 类型是旧 mock 字段（alarmType / alarmTime / status...） |
| [featureStyle.ts:56-61](file:///d:/work/telewave/ids/ids-gis-web/src/baseComponent/amap/featureStyle.ts#L56-L61) | `commonAlarm` 样式要求 `type: 'fire'\|'rescue'\|'society'` 和 `colorType: 'blue'\|'red'\|'grey'\|'def'` |
| [alarm.ts](file:///d:/work/telewave/ids/ids-gis-web/src/service/methods/alarm.ts) | `AlarmItem` 缺 `incidentId`；`DisasterProfileItem` 字段集是占位（id/incidentId/type/level/address...），与新 API 响应不符 |
| [FeatureClickQuery.ts:55-57](file:///d:/work/telewave/ids/ids-gis-web/src/baseComponent/OpenlayersMap/FeatureClickQuery.ts#L55-L57) | `useWebMock` 层会被排除出 WMS 查询 |

### 痛点

- `mountJRAlarmLayer` 接收一次性 alarms 数组，构造时就把 features 全部 `addFeature`，无运行时替换接口
- `JRAlarmList` 是写死的 `rawJRAlarmList.map(fromGcj02Data)`，永远不变
- 类型 `AlarmItem / DisasterProfileItem` 与 API 文档脱节
- 弹窗字段基于旧 mock 字段名（`alarmType` 等），与新 API（`disasterTypeLabel`）不一致

---

## Proposed Changes

### 1. 修正 `src/service/methods/alarm.ts` 类型（与 API 文档对齐）

**改 `AlarmItem`**：补 `incidentId` 字段（list 响应 records 需要）
```ts
export type AlarmItem = {
  id: string
  incidentId: string
  level: string
  address: string
  status: string
  createdAt: string
}
```

**重写 `DisasterProfileItem`**：按用户提供的 API 响应样例补齐
```ts
export type DisasterProfileItem = {
  disasterProfileId: string
  incidentId: string
  inquiryId: string
  buildingProfileId: string | null
  disasterAddress: string
  longitude: number | null
  latitude: number | null
  disasterType: string
  disasterTypeLabel: string
  disasterGrade: string
  disasterGradeLabel: string | null
  mOrgId: string
  mOrgIdLabel: string | null
  version: number
}
```

**Why**：当前类型与 API 实际响应完全不一致，调用方无法获得 TS 提示；下游映射 composable 依赖这些字段。

---

### 2. 新建 `src/composables/useAlarmHotspot.ts`（核心封装）

**职责**：封装"先 list → 拿 incidentIds → 拿 detail → 映射"完整链式流程，暴露响应式结果与手动触发函数。

**实现要点**：

```ts
import { computed, ref } from 'vue'
import { useRequest } from '@/composables/useAlova'
import {
  listAlarmMethod,
  getAlarmAllDetailMethod,
  type DisasterProfileItem,
} from '@/service/methods/alarm'
import type { JRAlarmData } from '@/baseComponent/amap/mapData'

const toJRAlarmData = (item: DisasterProfileItem): JRAlarmData | null => {
  if (item.longitude == null || item.latitude == null) return null
  const type =
    item.disasterType === 'FIRE' ? 'fire'
    : item.disasterType === 'RESCUE' ? 'rescue'
    : 'society'
  return {
    incidentId: item.incidentId,
    disasterType: item.disasterType,
    disasterTypeLabel: item.disasterTypeLabel,
    disasterGrade: item.disasterGrade,
    disasterGradeLabel: item.disasterGradeLabel,
    disasterAddress: item.disasterAddress,
    lng: item.longitude,
    lat: item.latitude,
    inquiryId: item.inquiryId,
    mOrgId: item.mOrgId,
    mOrgIdLabel: item.mOrgIdLabel,
    buildingProfileId: item.buildingProfileId,
    disasterProfileId: item.disasterProfileId,
    version: item.version,
    type,
    colorType: 'red',
  }
}

export const useAlarmHotspot = () => {
  const list = useRequest(
    () => listAlarmMethod({ stateFrom: 'CREATED', stateTo: 'CLOSED' }),
    { immediate: false },
  )

  const detail = useRequest(
    (incidentIds: string[]) => getAlarmAllDetailMethod(incidentIds),
    { immediate: false },
  )

  list.onSuccess(async (ev) => {
    const records = (ev.data as any)?.records ?? []
    const ids = records.map((r: { incidentId: string }) => r.incidentId).filter(Boolean)
    if (ids.length) await detail.send(ids)
    else detail.update({ data: { list: [], total: 0, page: 1, pageSize: 0 } })
  })

  const alarms = computed<JRAlarmData[]>(
    () => (detail.data.value?.list ?? [])
      .map(toJRAlarmData)
      .filter((d): d is JRAlarmData => d !== null),
  )

  const fetch = () => list.send()

  return {
    alarms,
    loading: computed(() => list.loading.value || detail.loading.value),
    error: computed(() => list.error.value ?? detail.error.value),
    fetch,
  }
}
```

**Why 用 composable 隔离**：
- `map.vue` 不必关心两层 API 串行编排、字段映射细节
- 后续如果有别的模块（如 `modelAssess`）需要同样的警情数据，可直接复用
- 单测可独立覆盖（虽然当前项目没单测，但保持纯函数友好）

---

### 3. 更新 `src/baseComponent/amap/mapData.ts` `JRAlarmData` 类型

**改** `JRAlarmData`：用 API 新字段替换 mock 字段；保留 `type` / `colorType` 兼容旧样式系统。

```ts
export type JRAlarmData = {
  incidentId: string
  disasterType: string
  disasterTypeLabel: string
  disasterGrade: string
  disasterGradeLabel: string | null
  disasterAddress: string
  lng: number
  lat: number
  inquiryId: string
  mOrgId: string
  mOrgIdLabel: string | null
  buildingProfileId: string | null
  disasterProfileId: string
  version: number
  type: 'fire' | 'rescue' | 'society'
  colorType: 'blue' | 'red' | 'grey' | 'def'
}
```

**保留 `JRAlarmStatus` 与 `rawJRAlarmList` / `JRAlarmList` 不动**（仍有其他场景可能引用，例如 amap mock 数据演示）。如本次任务全程不再使用，可后续清理（不在本次范围）。

---

### 4. 扩展 `src/baseComponent/amap/useAmapTools.ts` `mountJRAlarmLayer` 暴露 `setData`

**现状** ([useAmapTools.ts:246-306](file:///d:/work/telewave/ids/ids-gis-web/src/baseComponent/amap/useAmapTools.ts#L246-L306))：manager 只暴露 `hide / setVisible / isVisible / destroy`，无运行时数据替换接口。

**改**：在返回对象新增 `setData(alarms: JRAlarmData[])`：
```ts
const setData = (next: JRAlarmData[]) => {
  source.clear()
  next.forEach((alarm) => {
    if (!Number.isFinite(alarm.lng) || !Number.isFinite(alarm.lat)) return
    const feature = new Feature({
      geometry: new Point(olProj.fromLonLat([alarm.lng, alarm.lat])),
    })
    feature.set('data', alarm)
    feature.setStyle(getStyle('commonAlarm', {
      type: alarm.type, colorType: alarm.colorType,
    }))
    source.addFeature(feature)
  })
}
```
- 初始 `mountJRAlarmLayer` 调用时仍传空数组 `[]`（让图层先存在，setVisible 控制可见性）
- `setData` 抽离出原 `createJRAlarmLayer` 中的循环逻辑；`createJRAlarmLayer` 内部也可改用 `setData` 减少重复

**Why**：保留 setVisible 控制可见性的现有行为；通过 `setData` 实现数据替换，保持 API 调用与渲染解耦。

---

### 5. 更新 `src/baseComponent/OpenlayersMap/map.vue` 集成新流程

**改 1**：导入 `useAlarmHotspot`
```ts
import { useAlarmHotspot } from '@/composables/useAlarmHotspot'
const { alarms, loading: alarmsLoading, fetch: fetchAlarms } = useAlarmHotspot()
```

**改 2**：`mountJRAlarmLayer` 调用传 `[]`（初次）
```ts
jrAlarmManager = mountJRAlarmLayer({
  map,
  alarms: [],
  popupElement: jrAlarmPopupRef.value,
  visible: ...,
  onSelect: ...,
  onClose: ...,
})
```

**改 3**：`watch(alarms, (next) => jrAlarmManager?.setData(next))` 把 composable 数据喂给 manager

**改 4**：`setTempFrontendLayerVisible` 中触发拉取
```ts
const setTempFrontendLayerVisible = (id: string, visible: boolean) => {
  const managerMap: Record<string, TempFrontendLayerManager | null> = {
    [TEMP_FRONTEND_LAYER_IDS.STATION]: fireManager,
    [TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER]: jrAlarmManager,
  }
  const manager = managerMap[id]
  if (!manager) return false
  manager.setVisible(visible)
  if (id === TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER && visible) {
    fetchAlarms()
  }
  return true
}
```

**改 5**：更新 `jrAlarmPopupTitle` / `jrAlarmPopupRows` 用新字段
```ts
const jrAlarmPopupTitle = computed(() => {
  const d = jrAlarmData.value
  return d ? `${d.disasterTypeLabel} - ${d.disasterGradeLabel ?? ''}`.trim() : '警情详情'
})

const jrAlarmPopupRows = computed<AlarmDetailRow[]>(() => {
  const d = jrAlarmData.value
  return [
    { label: '警情类型', value: d?.disasterTypeLabel },
    { label: '警情等级', value: d?.disasterGradeLabel ?? d?.disasterGrade },
    { label: '事发地址', value: d?.disasterAddress },
    { label: '警情编号', value: d?.incidentId },
    { label: '问询编号', value: d?.inquiryId },
    { label: '主管队站', value: d?.mOrgIdLabel ?? d?.mOrgId },
    { label: '坐标', value: formatCoordinateText(d?.lng, d?.lat) },
  ]
})
```

**Why 改 5**：旧 popup 字段名与 API 响应不匹配，按用户选择"按 API 新结构更新 popup 与样式映射"对齐。

---

### 6. 更新 `src/config/layers.ts` 标记 disaster_info 非 mock

```ts
{
  ...dispatchGroup,
  ...categories.alarm,
  id: 'gis:disaster_info',
  name: '警情热点',
  workspace: 'gis',
  typeName: 'gis:disaster_info',
  order: 1,
  enabled: true,
  visible: true,
  defaultVisible: true,
  icon: 'mdi:alert-circle-outline',
  noEsSearch: true,        // 仍走前端矢量渲染，不让 WMS GetFeatureInfo 查它
  useWebMock: false,       // 已不依赖前端 mock 数据
}
```

**Why**：
- `useWebMock: false` 让 `FeatureClickQuery` 行为变化可控（因 disaster_info 实际并非 WMS 图层）
- `noEsSearch: true` 显式声明"不参与 WMS GetFeatureInfo"，避免对空 WMS 层发请求
- `TEMP_FRONTEND_LAYER_IDS.TODAY_DISASTER` 保持不变；`isTempFrontendLayerId` 中 `getLayerConfig(id)?.useWebMock` 兜底已无意义但不影响行为

---

## Assumptions & Decisions

| 假设 | 决策 |
|---|---|
| 用户每次勾选显示图层都要重新请求 | ✅ 勾选显示时调用 `fetchAlarms()`，但 alova 30s 缓存会复用上一次结果；如需强制刷新后续可加 |
| 经纬度为 `null` 的项不应该上图 | ✅ `toJRAlarmData` 返回 `null` 时被 `filter` 掉 |
| `disasterType: 'FIRE'` 映射到 `type: 'fire'` | ✅ 大写转小写，'RESCUE' → 'rescue'，其他 → 'society'（保守兜底） |
| `colorType` 暂时统一用 `'red'` | ✅ 简单起见，后续可按 `disasterGrade` 区分（本次不做） |
| 不做加载 loading UI | ✅ 弹窗/全局 ElMessage 暂不显示，避免过度工程化 |
| `useAlova` 的 `useRequest` 支持 `onSuccess` 事件链 | ✅ 已在 [composables/useAlova.ts](file:///d:/work/telewave/ids/ids-gis-web/src/composables/useAlova.ts) 暴露 `useRequest` |
| `useRequest` 的 `methodHandler` 可传函数形式 | ✅ 官方支持（用于 send 传参） |
| `disaster_info` 不再作为 WMS 图层查询 | ✅ 加 `noEsSearch: true` 显式排除 |

---

## Verification Steps

1. **类型检查**：`pnpm tsc --noEmit`（或 `vue-tsc --noEmit`）无报错
2. **本地启动**：`pnpm dev` 打开主页
3. **图层渲染**：
   - 默认勾选"警情热点"，控制台 Network 看到 `alarm-client/api/alarm-incidents` 与 `disaster-profile-client/api/disaster-profiles/page` 两次请求
   - 地图上出现 API 返回的 marker（按 lng/lat）
4. **弹窗验证**：点击 marker，弹窗字段（警情类型/等级/地址/警情编号/问询编号/主管队站/坐标）正确显示
5. **切换触发**：
   - 取消勾选 → 重新勾选 → 看到新一次 list 请求（30s 后）或命中缓存
6. **空数据保护**：当 `records` 为空时，无 marker 渲染，不报错
7. **WMS 查询**：`FeatureClickQuery` 仍正常工作（不应因 `useWebMock: false` 误把 disaster_info 算进 WMS 查询）；如仍异常，需检查 `noEsSearch` 是否生效
8. **不破坏其他图层**：水源 / 主管队站 / 重点单位等其它图层渲染不受影响
9. **控制台无未捕获错误 / 警告**

---

## Files Changed Summary

| 文件 | 变更类型 | 简述 |
|---|---|---|
| `src/service/methods/alarm.ts` | 修改 | 补 `AlarmItem.incidentId`；重写 `DisasterProfileItem` 字段 |
| `src/composables/useAlarmHotspot.ts` | **新建** | 封装两层 API 链式调用 + 字段映射 |
| `src/baseComponent/amap/mapData.ts` | 修改 | `JRAlarmData` 字段对齐新 API |
| `src/baseComponent/amap/useAmapTools.ts` | 修改 | `mountJRAlarmLayer` 暴露 `setData` |
| `src/baseComponent/OpenlayersMap/map.vue` | 修改 | 集成 composable；勾选触发 fetch；popup 字段更新 |
| `src/config/layers.ts` | 修改 | `disaster_info`: `useWebMock: false` + `noEsSearch: true` |
