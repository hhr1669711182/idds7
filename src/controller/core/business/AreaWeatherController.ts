// 用途：行政区划天气联动编排（层级下钻 / 天气查询 / 围栏定位高亮）。
import { ref, type Ref } from 'vue'
import {
  AREA_LEVEL,
  fetchAreaByCode,
  fetchAreaBoundary,
  fetchAreaChildren,
  fetchAreaFence,
  fetchJurisdictionStations,
  fetchJurisdictionZones,
  type AreaNode,
  type JurisdictionZone,
  type JurisdictionStation,
} from '@/apis/envArea'
import { weather as weatherApi, type AmapWeatherLive } from '@/apis/amap'
import type { BusinessMapPort } from '../protocol/BusinessMapPort'

/**
 * 面板最多展示的层级数（顶层 + 两级下钻 = 三级）。
 * 顶层默认取项目配置的行政区划编码，按 addrlevel_id 判断每一层的实际内容：
 * 省(1)→市(2)→区县(3)；市(2)→区县(3)→街道(4)；直辖市(1)→区(2)→街道(3)。
 */
export const AREA_PANEL_LEVEL_COUNT = 3

/** 选区状态：供视图层消费 */
export interface AreaPanelState {
  /** 顶层区划（默认配置的那个） */
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
  /** 队站辖区（顶层辖区内的队站管辖面） */
  zones: JurisdictionZone[]
  /** 区划编码 → 区划名，供队站列表展示所属区划 */
  areaNames: Map<string, string>
  /** 天气实况 */
  live: AmapWeatherLive | null
  /** 天气实际来源区划名（街道级回退到区县时与所选区划不同） */
  liveSourceName: string
  /** 围栏缺失提示 */
  fenceMissing: boolean
  /** 错误提示 */
  errorMsg: string
}

const createInitialState = (): AreaPanelState => ({
  root: null,
  rootChildren: [],
  expandedCode: null,
  expandedChildren: [],
  selected: null,
  stations: [],
  zones: [],
  areaNames: new Map(),
  live: null,
  liveSourceName: '',
  fenceMissing: false,
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
   * 初始化：按默认区划编码加载顶层、下一层与主管队站。
   * @param areaCode 默认行政区划编码（项目配置中的 adcode）
   */
  public async init(areaCode: string): Promise<void> {
    if (this.disposed || !areaCode) return
    const root = await this.loadNode(areaCode)
    if (!root) {
      this.state.value.errorMsg = '未能加载默认行政区划'
      return
    }
    const seq = ++this.requestSeq
    this.state.value.root = root
    this.state.value.selected = root
    this.state.value.errorMsg = ''

    const rootChildren = await this.loadChildren(root.areaCode)
    if (this.disposed || seq !== this.requestSeq) return
    this.state.value.rootChildren = rootChildren

    // 默认展开顶层的第一条，让第三层清单有内容可看
    const first = rootChildren[0]
    if (first) {
      this.state.value.expandedCode = first.areaCode
      this.state.value.expandedChildren = await this.loadChildren(first.areaCode)
    }

    const areaNames = await this.collectAreaNames(root, rootChildren)
    if (this.disposed || seq !== this.requestSeq) return
    this.state.value.areaNames = areaNames

    await Promise.all([
      this.loadStations(root.areaCode, areaNames, seq),
      this.loadZones(root.areaCode, areaNames, seq),
      this.loadWeather(root, seq),
    ])
  }

  /** 选中某个区划：刷新天气与围栏 */
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
    state.fenceMissing = false

    // 选中第二层时刷新第三层清单
    if (state.rootChildren.some((item) => item.areaCode === node.areaCode)) {
      state.expandedCode = node.areaCode
      const children = await this.loadChildren(node.areaCode)
      if (this.disposed || seq !== this.requestSeq) return
      state.expandedChildren = children
    }

    await Promise.all([this.loadWeather(node, seq), this.loadFence(node)])
  }

  /** 清除地图上的围栏描边 */
  public clearFence(): void {
    if (this.disposed) return
    this.port.areaFenceClear?.()
  }

  /**
   * 选中某个队站：定位到该队站的主管辖区面并高亮。
   * 辖区缺失时清掉现有围栏，避免残留上一层的描边。
   */
  public async selectStation(zoneId: string): Promise<void> {
    if (this.disposed || !zoneId) return
    const zone = this.state.value.zones.find((item) => item.zoneId === zoneId)
    if (!zone) {
      this.state.value.fenceMissing = true
      return
    }
    this.state.value.fenceMissing = false
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

  /** 加载顶层辖区内的主管队站 */
  private async loadStations(areaCode: string, areaNames: Map<string, string>, seq: number): Promise<void> {
    try {
      const stations = await fetchJurisdictionStations(areaCode, areaNames)
      if (this.disposed || seq !== this.requestSeq) return
      this.state.value.stations = stations
    } catch (error) {
      console.error('[AreaWeatherController] 加载主管队站失败', error)
      if (this.disposed || seq !== this.requestSeq) return
      this.state.value.stations = []
    }
  }

  /** 加载顶层辖区内的队站辖区（主管辖区面） */
  private async loadZones(areaCode: string, areaNames: Map<string, string>, seq: number): Promise<void> {
    try {
      const zones = await fetchJurisdictionZones(areaCode, areaNames)
      if (this.disposed || seq !== this.requestSeq) return
      this.state.value.zones = zones
    } catch (error) {
      console.error('[AreaWeatherController] 加载队站辖区失败', error)
      if (this.disposed || seq !== this.requestSeq) return
      this.state.value.zones = []
    }
  }

  /** 收集区划编码 → 区划名，供队站列表展示所属区划 */
  private async collectAreaNames(root: AreaNode, rootChildren: AreaNode[]): Promise<Map<string, string>> {
    const names = new Map<string, string>()
    names.set(root.areaCode, root.areaName)
    for (const child of rootChildren) names.set(child.areaCode, child.areaName)
    const streetChildren = await this.loadChildren(rootChildren[0]?.areaCode ?? '')
    for (const child of streetChildren) names.set(child.areaCode, child.areaName)
    return names
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

  /**
   * 逐级向上试探天气 adcode：街道/乡镇级高德无数据，回退到所属区县。
   */
  private async resolveWeather(
    node: AreaNode,
  ): Promise<{ adcode: string; live: AmapWeatherLive | null; sourceName: string }> {
    const chain = await buildAncestorChain(node)

    for (const candidate of chain) {
      try {
        const data = await weatherApi({ city: candidate.areaCode })
        const item = data?.lives?.[0]
        if (item && item.temperature !== null && item.temperature !== undefined) {
          return { adcode: candidate.areaCode, live: item, sourceName: candidate.areaName }
        }
      } catch (error) {
        console.error('[AreaWeatherController] 天气获取失败', error)
      }
    }
    return { adcode: '', live: null, sourceName: '' }
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
      this.state.value.fenceMissing = false
      this.port.areaFenceHighlight?.({
        areaCode: fence.areaCode,
        areaName: fence.areaName,
        geometry: fence.geometry,
        flash: true,
      })
      return
    }
    if (this.disposed) return
    this.state.value.fenceMissing = true
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
