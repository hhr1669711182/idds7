// 用途：行政区划天气联动编排（层级下钻 / 天气查询 / 围栏定位高亮）。
import { ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  AREA_LEVEL,
  fetchAreaByCode,
  fetchAreaBoundary,
  fetchAreaChildren,
  fetchAreaFence,
  fetchJurisdictionStations,
  fetchJurisdictionZoneByStationId,
  type AreaNode,
  type JurisdictionStation,
  type JurisdictionZone,
} from '@/apis/envArea'
import { weather as amapWeather } from '@/apis/amap'
import { loadWeather, type WeatherLive } from '@/apis/weather'
import { appEnv } from '@/config/env'
import type { BusinessMapPort } from '../protocol/BusinessMapPort'

/**
 * 面板最多展示的层级数（顶层 + 两级下钻 = 三级）。
 * 顶层默认取项目配置的行政区划编码，按 addrlevel_id 判断每一层的实际内容：
 * 省(1)→市(2)→区县(3)；市(2)→区县(3)→街道(4)；直辖市(1)→区(2)→街道(3)。
 */
export const AREA_PANEL_LEVEL_COUNT = 3

/** 选区状态：供视图层消费 */
export interface AreaPanelState {
  /** init 时传入的原始 areaCode（区划树未加载时用于天气兜底查询） */
  rootCode: string
  /** 顶层区划（默认配置的那个，面板打开后填充） */
  root: AreaNode | null
  /** 第二层清单：顶层区划的下一级（白字网格） */
  rootChildren: AreaNode[]
  /** 当前展开到第三层的区划编码 */
  expandedCode: string | null
  /** 第三层清单：展开区划的下一级（蓝字网格） */
  expandedChildren: AreaNode[]
  /** 当前选中的区划 */
  selected: AreaNode | null
  /** 主管队站（顶层辖区内的队站） */
  stations: JurisdictionStation[]
  /** 区划编码 → 区划名（从已加载的 root + rootChildren 构建，供队站列表展示所属区划） */
  areaNames: Map<string, string>
  /** 天气实况 */
  live: WeatherLive | null
  /** 天气实际来源区划名（街道级回退到区县时与所选区划不同） */
  liveSourceName: string
  /** 错误提示 */
  errorMsg: string
}

const createInitialState = (): AreaPanelState => ({
  rootCode: '',
  root: null,
  rootChildren: [],
  expandedCode: null,
  expandedChildren: [],
  selected: null,
  stations: [],
  areaNames: new Map(),
  live: null,
  liveSourceName: '',
  errorMsg: '',
})

/** 根哨兵：gis:env_area 里 area_code='1' 是中国，'0' 是其父，再往上没有行政区划 */
const ROOT_AREA_CODES = new Set(['0', '1'])

/**
 * 构造「自身 → 逐级向上」的区划链，最多向上 4 级。
 * 天气与围栏都按这条链逐级回退（街道级数据缺失时退回所属区县）。
 */
const buildAncestorChain = async (node: AreaNode): Promise<AreaNode[]> => {
  const chain: AreaNode[] = [node]
  let parentCode = node.parentCode
  let guard = 0
  while (parentCode && !ROOT_AREA_CODES.has(parentCode) && guard < AREA_LEVEL.STREET) {
    const parent = await fetchAreaByCode(parentCode).catch(() => null)
    if (!parent) break
    chain.push(parent)
    parentCode = parent.parentCode
    guard += 1
  }
  return chain
}

/**
 * 行政区划天气联动控制器。
 * 负责：层级下钻加载、天气查询（街道级回退到上级）、围栏定位高亮。
 * 只依赖 BusinessMapPort 与接口层，不直接接触地图引擎。
 */
export class AreaWeatherController {
  private readonly state: Ref<AreaPanelState> = ref(createInitialState())
  private requestSeq = 0
  private disposed = false

  constructor(private readonly port: BusinessMapPort) {}

  public getState(): Ref<AreaPanelState> {
    return this.state
  }

  /**
   * 初始化：预请求区划树（root → 第一级子 → 第二级子取第一个）+ 队站 + 天气。
   * 面板打开即有数据，无需二次请求。
   * 初始化阶段 WFS 总数 ≈ 4~5 条（root + children + grandchildren + stations）。
   * @param areaCode 默认行政区划编码（项目配置中的 adcode）
   */
  public async init(areaCode: string): Promise<void> {
    if (this.disposed || !areaCode) return
    const seq = ++this.requestSeq
    this.state.value.rootCode = areaCode
    this.state.value.errorMsg = ''

    // 1. 加载 root 节点（1 WFS）
    const root = await this.loadNode(areaCode)
    if (this.disposed || seq !== this.requestSeq) return
    if (!root) {
      this.state.value.errorMsg = '未能加载默认行政区划'
      return
    }
    this.state.value.root = root
    this.state.value.selected = root

    // 2. 加载 rootChildren（第二层，1 WFS）
    const rootChildren = await this.loadChildren(root.areaCode)
    if (this.disposed || seq !== this.requestSeq) return
    this.state.value.rootChildren = rootChildren

    // 3. 默认展开第一条，加载 grandchildren（第三层，1 WFS）
    const first = rootChildren[0]
    if (first) {
      this.state.value.expandedCode = first.areaCode
      this.state.value.expandedChildren = await this.loadChildren(first.areaCode)
    }

    // 4. 从已加载的 root + rootChildren 构建小 nameMap（~10 条），补全队站所属区划名
    const nameMap = new Map<string, string>()
    nameMap.set(root.areaCode, root.areaName)
    for (const child of rootChildren) nameMap.set(child.areaCode, child.areaName)
    this.state.value.areaNames = nameMap

    // 5. 预加载队站（root + rootChildren codes 做 IN 查询，1 WFS）
    const codeList = [root.areaCode, ...rootChildren.map((c) => c.areaCode)]
    await this.loadStations(codeList, nameMap, seq)

    // 6. 加载天气（Amap，通常城市级 1 次就命中）
    await this.loadWeather(root, seq)
  }

  /** 选中某个区划：二级请求下级+围栏，末级只请求围栏 */
  public async selectArea(areaCode: string): Promise<void> {
    if (this.disposed || !areaCode) return
    const state = this.state.value
    const node =
      state.rootChildren.find((item) => item.areaCode === areaCode) ??
      state.expandedChildren.find((item) => item.areaCode === areaCode) ??
      (await this.loadNode(areaCode))
    if (!node) {
      state.errorMsg = '未能加载所选行政区划'
      return
    }
    if (this.disposed) return

    const seq = ++this.requestSeq
    state.selected = node
    state.errorMsg = ''

    // 选中第二层（rootChildren 中的项）时刷新第三层清单；末级（expandedChildren 中的项）不再请求下级
    const isSecondLevel = state.rootChildren.some((item) => item.areaCode === node.areaCode)
    if (isSecondLevel) {
      state.expandedCode = node.areaCode
      const children = await this.loadChildren(node.areaCode)
      if (this.disposed || seq !== this.requestSeq) return
      state.expandedChildren = children
    }

    // 街道级（末级）不再查询天气，直接定位围栏；区县级及以上才查天气 + 围栏。
    if (this.isStreetLevel(node)) {
      await this.loadFence(node)
    } else {
      await Promise.all([this.loadWeather(node, seq), this.loadFence(node)])
    }
  }

  /** 是否为街道/末级区划（出现在第三层清单 expandedChildren 中、且不在第二层 rootChildren 中）。末级不查天气，只定位围栏。 */
  private isStreetLevel(node: AreaNode): boolean {
    const state = this.state.value
    if (state.rootChildren.some((item) => item.areaCode === node.areaCode)) return false
    return state.expandedChildren.some((item) => item.areaCode === node.areaCode)
  }

  /** 清除地图上的围栏描边 */
  public clearFence(): void {
    if (this.disposed) return
    this.port.areaFenceClear?.()
  }

  /** 仅刷新当前选中区划的天气，不触发围栏定位/闪烁（供定时器轮询使用） */
  public async refreshWeather(): Promise<void> {
    if (this.disposed) return
    const node = this.state.value.selected
    if (!node) return
    // 街道级（末级）不查天气，跳过定时轮询
    if (this.isStreetLevel(node)) return
    const seq = ++this.requestSeq
    await this.loadWeather(node, seq)
  }

  /**
   * 选中某个队站：按需查询该队站的主管辖区面并定位高亮。
   * 辖区缺失时清掉现有围栏，避免残留上一层的描边。
   */
  public async selectStation(stationId: string): Promise<void> {
    if (this.disposed || !stationId) return
    let zone: JurisdictionZone | null
    try {
      zone = await fetchJurisdictionZoneByStationId(stationId)
    } catch (error) {
      console.error('[AreaWeatherController] 查询队站辖区失败', error)
      zone = null
    }
    if (this.disposed) return
    if (!zone) {
      const stationName = this.state.value.stations.find((s) => s.id === stationId)?.name
      ElMessage.warning(`队站「${stationName ?? stationId}」暂无辖区数据`)
      this.port.areaFenceClear?.()
      return
    }
    this.port.areaFenceHighlight?.({
      areaCode: zone.areaCode,
      areaName: zone.zoneName,
      geometry: zone.geometry,
      flash: true,
    })
  }

  private async loadNode(areaCode: string): Promise<AreaNode | null> {
    try {
      return await fetchAreaByCode(areaCode)
    } catch (error) {
      console.error('[AreaWeatherController] 加载区划失败', error)
      this.state.value.errorMsg = '加载行政区划失败'
      return null
    }
  }

  private async loadChildren(parentCode: string): Promise<AreaNode[]> {
    if (this.disposed || !parentCode) return []
    try {
      return await fetchAreaChildren(parentCode)
    } catch (error) {
      console.error('[AreaWeatherController] 加载下级区划失败', error)
      this.state.value.errorMsg = '加载下级区划失败'
      return []
    }
  }

  /** 加载指定区划编码列表下的主管队站 */
  private async loadStations(codeList: string[], areaNames: Map<string, string>, seq: number): Promise<void> {
    try {
      const stations = await fetchJurisdictionStations(codeList, areaNames)
      if (this.disposed || seq !== this.requestSeq) return
      this.state.value.stations = stations
    } catch (error) {
      console.error('[AreaWeatherController] 加载主管队站失败', error)
      if (this.disposed || seq !== this.requestSeq) return
      this.state.value.stations = []
    }
  }

  /**
   * 加载天气。街道/乡镇级 adcode 高德查不到，逐级回退到上级区划。
   */
  private async loadWeather(node: AreaNode, seq: number): Promise<void> {
    const fallback = await this.resolveWeather(node)
    if (this.disposed || seq !== this.requestSeq) return
    if (!fallback.adcode) {
      this.state.value.live = null
      this.state.value.liveSourceName = ''
      this.state.value.errorMsg = '暂无天气数据'
      return
    }
    this.state.value.live = fallback.live
    this.state.value.liveSourceName = fallback.sourceName
  }

  /** 逐级向上试探天气 adcode：街道/乡镇级无数据时回退到所属区县。 */
  private async resolveWeather(
    node: AreaNode,
  ): Promise<{ adcode: string; live: WeatherLive | null; sourceName: string }> {
    const chain = await buildAncestorChain(node)

    for (const candidate of chain) {
      try {
        const live = await this.fetchLive(candidate)
        if (live) return { adcode: candidate.areaCode, live, sourceName: candidate.areaName }
      } catch (error) {
        console.error('[AreaWeatherController] 天气获取失败', error)
      }
    }
    return { adcode: '', live: null, sourceName: '' }
  }

  /** 按 env.weatherSource 分流取天气：new=主实例拼音接口，amap=旧高德代理 */
  private async fetchLive(candidate: AreaNode): Promise<WeatherLive | null> {
    if (appEnv.weatherSource === 'amap') {
      const data = await amapWeather({ city: candidate.areaCode })
      const item = data?.lives?.[0]
      if (!item) return null
      return {
        adcode: candidate.areaCode,
        weather: item.weather,
        temperature: item.temperature,
        winddirection: item.winddirection,
        windpower: item.windpower,
        humidity: item.humidity,
        reporttime: item.reporttime,
        province: item.province,
        city: item.city,
      }
    }
    return loadWeather(candidate.areaCode, { city: candidate.areaName })
  }

  /**
   * 加载围栏并下发高亮指令。
   * gis:env_area_fence 数据稀疏（区县级为主），命中不到时用 DataV 边界兜底；
   * 都没有则回退到上级区划，仍没有才提示无围栏数据。
   */
  private async loadFence(node: AreaNode): Promise<void> {
    const chain = await buildAncestorChain(node)

    for (const candidate of chain) {
      const fence = await this.fetchFenceGeometry(candidate)
      if (!fence) continue
      if (this.disposed) return
      this.port.areaFenceHighlight?.({
        areaCode: fence.areaCode,
        areaName: fence.areaName,
        geometry: fence.geometry,
        flash: true,
      })
      return
    }
    if (this.disposed) return
    ElMessage.warning(`区划「${node.areaName}」暂无围栏数据`)
    this.port.areaFenceClear?.()
  }

  /** 单个区划的围栏几何：先查 GeoServer 围栏表，再查 DataV 边界 */
  private async fetchFenceGeometry(
    node: AreaNode,
  ): Promise<{ areaCode: string; areaName: string; geometry: GeoJSON.Geometry } | null> {
    try {
      const fence = await fetchAreaFence(node.areaCode)
      if (fence?.geometry) {
        return { areaCode: fence.areaCode, areaName: fence.areaName || node.areaName, geometry: fence.geometry }
      }
    } catch (error) {
      console.error('[AreaWeatherController] 围栏查询失败', error)
    }
    try {
      const boundary = await fetchAreaBoundary(node.areaCode)
      if (boundary?.geometry) {
        return {
          areaCode: node.areaCode,
          areaName: boundary.areaName || node.areaName,
          geometry: boundary.geometry,
        }
      }
    } catch (error) {
      console.error('[AreaWeatherController] 边界兜底查询失败', error)
    }
    return null
  }

  public dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.requestSeq += 1
  }
}
