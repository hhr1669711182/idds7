import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, getActivePinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import * as olProj from 'ol/proj'
import { useStationLayerStore } from '@/store/useIncidentLocationStore'
import { usePendingCallLocationStore } from '@/store/usePendingCallLocationStore'
import { MOCK_CALL_LOCATION_ID } from '@/const/const.message.type'
import {
  getSelectedRoute,
  matchStationRoute,
  type RouteAlternative,
  type StationRouteAlternatives,
} from '@/baseComponent/amap/routeAlternatives'
import { computeRouteMetrics, type LngLat } from '@/baseComponent/amap/routeMetrics'
import type { MockMapPort } from '@/controller/core/protocol/BusinessMapPort'
import type { SharedDispatchVehicleMock } from '@/composables/useMockCallLocationBridge'

vi.mock('@/store', async () => ({ useUserStore: (await import('@/store/useUserStore')).useUserStore }))
vi.mock('@/apis/geoserver', () => ({ geoserverApi: {} }))

const filename = resolve('src/baseComponent/OpenlayersMap/dispatchMap.vue')
const script = parse(readFileSync(filename, 'utf8')).descriptor.scriptSetup!.content
const source = ts.createSourceFile(filename, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const names = new Set([
  'MOCK_DISPATCH_STATION_OWNER',
  'applyMockDispatchStationIcons',
  'clearMockDispatchStationIcons',
  'resetRouteVideoPlayback',
  'clearMockTrackingTimers',
  'resolveMockDestination',
  'resolveStationCoordinates',
  'receiveMockDispatchVehicles',
])
const declarations = source.statements.filter(
  (statement) =>
    ts.isVariableStatement(statement) &&
    statement.declarationList.declarations.some((declaration) => names.has(declaration.name.getText(source))),
)
if (declarations.length !== names.size) throw new Error('dispatchMap vehicle declarations changed')
let mockPortSource = ''
const findMockPort = (node: ts.Node): void => {
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'businessRuntime.attachMap') {
    const options = node.arguments[1]
    if (options && ts.isObjectLiteralExpression(options)) {
      const mock = options.properties.find(
        (property) => ts.isPropertyAssignment(property) && property.name.getText(source) === 'mock',
      )
      if (mock && ts.isPropertyAssignment(mock)) mockPortSource = mock.initializer.getText(source)
    }
  }
  ts.forEachChild(node, findMockPort)
}
findMockPort(source)
if (!mockPortSource) throw new Error('dispatchMap mock port changed')
const executable = ts.transpileModule(
  declarations.map((declaration) => declaration.getText(source)).join('\n') + '\n(' + mockPortSource + ');',
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } },
).outputText

const deferred = <Value>() => {
  let resolve!: (value: Value) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<Value>((complete, fail) => {
    resolve = complete
    reject = fail
  })
  return { promise, resolve, reject }
}

const route: RouteAlternative = {
  id: 'fastest',
  preferences: ['fastest'],
  etaSeconds: 60,
  result: {
    fullPath: [
      [114, 22],
      [115, 23],
    ],
    tmcs: [],
    congestionPoints: [],
    distanceMeters: 1000,
    durationSeconds: 60,
  },
  metrics: computeRouteMetrics([
    [114, 22],
    [115, 23],
  ]),
}
const createPlanner = () => ({
  fetchRouteAlternatives: vi
    .fn<(origin: LngLat, destination: LngLat) => Promise<RouteAlternative[]>>()
    .mockResolvedValue([route]),
  renderRoutesOnly: vi.fn(),
  renderRouteAlternatives: vi.fn(),
  clearRouteVideoCheckpoints: vi.fn(),
  setRouteVideoCheckpoints: vi.fn(),
  startRouteVehicleAnimation: vi.fn(),
  setRouteVehicleGroups: vi.fn(),
})
const createMap = () => ({ getView: () => view })
const view = { animate: vi.fn() }
const vehicles = (stationId = 'station-A'): SharedDispatchVehicleMock[] => [
  { vehicleId: 'vehicle-' + stationId, stationId },
]

const setup = () => {
  const environment = {
    nav: createPlanner(),
    map: createMap(),
    pendingRoutePlan: null as Promise<void> | null,
    routeVideoGeneration: 0,
    mockMapGeneration: 0,
    specialMapActive: false,
    specialMapMock: null,
    mockDispatchState: null,
    mockDispatchPrimaryGate: null,
    mockTrackingTimers: [] as number[],
    incidentVideoController: { close: vi.fn() },
    featureClickQuery: { close: vi.fn() },
    incidentLocationStore: { primaryStations: {}, zones: {}, routePlanRequest: { destination: [115, 23] as LngLat } },
    pendingCallLocationStore: usePendingCallLocationStore(),
    lastRoutePlanResults: [],
    routePreviewStations: ref<StationRouteAlternatives[]>([]),
    routePreviewVisible: ref(false),
    useStationLayerStore,
    MOCK_CALL_LOCATION_ID,
    getSelectedRoute,
    matchStationRoute,
    queryStationCoordinatesByIds: vi.fn<(ids: string[]) => Promise<Map<string, LngLat>>>().mockResolvedValue(
      new Map([
        ['station-A', [114, 22]],
        ['station-B', [114.5, 22.5]],
      ]),
    ),
    ensureAmapKey: () => '',
    syncPrimaryStationVisibility: vi.fn(),
    handleSecondaryDispatch: vi.fn(),
    playRouteVideoCheckpoint: vi.fn(),
    ElMessage: { warning: vi.fn() },
    window,
    console,
    olProj,
  }
  const mock = runInNewContext(executable, environment, { filename }) as MockMapPort
  return { environment, mock, stations: useStationLayerStore() }
}

describe('dispatchMap 车辆执行边界（回归 2026-10-15 P2 在途失效与旧失败清新图标）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    view.animate.mockClear()
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    const pinia = getActivePinia()
    if (pinia) disposePinia(pinia)
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('Given 车辆等待地址规划 When clear 后规划完成 Then 旧任务不绘制、不安排动画也不恢复图标', async () => {
    const { environment, mock, stations } = setup()
    const planning = deferred<void>()
    environment.pendingRoutePlan = planning.promise
    const task = mock.dispatchVehicles(vehicles())
    mock.clear()
    planning.resolve()
    await task
    expect(environment.queryStationCoordinatesByIds).not.toHaveBeenCalled()
    expect(environment.nav.renderRoutesOnly).not.toHaveBeenCalled()
    expect(stations.selectedStationIds).toEqual([])
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['nav', 'map'] as const)(
    'Given 车辆等待地址规划 When %s 实例替换而generation相同 Then 不接管新图面',
    async (owner) => {
      const { environment, mock, stations } = setup()
      const planning = deferred<void>()
      environment.pendingRoutePlan = planning.promise
      const task = mock.dispatchVehicles(vehicles())
      if (owner === 'nav') environment.nav = createPlanner()
      else environment.map = createMap()
      planning.resolve()
      await task
      expect(environment.queryStationCoordinatesByIds).not.toHaveBeenCalled()
      expect(stations.selectedStationIds).toEqual([])
    },
  )

  it('Given 队站坐标查询在途 When 地图替换后返回 Then 不给新图面写图标或发起算路', async () => {
    const { environment, mock, stations } = setup()
    const coordinates = deferred<Map<string, LngLat>>()
    environment.queryStationCoordinatesByIds.mockReturnValueOnce(coordinates.promise)
    const task = mock.dispatchVehicles(vehicles())
    environment.map = createMap()
    coordinates.resolve(new Map([['station-A', [114, 22]]]))
    await task
    expect(stations.selectedStationIds).toEqual([])
    expect(environment.nav.fetchRouteAlternatives).not.toHaveBeenCalled()
    expect(environment.nav.renderRoutesOnly).not.toHaveBeenCalled()
  })

  it('Given A算路在途且clear后B已上图 When A失败 Then B图标不被清除且没有旧错误提示', async () => {
    const { environment, mock, stations } = setup()
    const oldRoutes = deferred<RouteAlternative[]>()
    environment.nav.fetchRouteAlternatives.mockReturnValueOnce(oldRoutes.promise)
    const oldTask = mock.dispatchVehicles(vehicles())
    await vi.advanceTimersByTimeAsync(0)
    expect(environment.nav.fetchRouteAlternatives).toHaveBeenCalledTimes(1)
    mock.clear()
    await mock.dispatchVehicles(vehicles('station-B'))
    expect(stations.selectedStationIds).toEqual(['station-B'])
    oldRoutes.reject(new Error('old request failed'))
    await oldTask
    expect.soft(environment.ElMessage.warning).not.toHaveBeenCalled()
    expect.soft(console.warn).not.toHaveBeenCalled()
    expect(stations.selectedStationIds).toEqual(['station-B'])
    expect(environment.nav.renderRoutesOnly).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(800)
    expect(environment.nav.setRouteVehicleGroups).toHaveBeenCalledExactlyOnceWith([vehicles('station-B')])
  })

  it('Given 路线查询在途 When 地图替换后成功返回 Then 不绘制或安排旧动画', async () => {
    const { environment, mock } = setup()
    const routes = deferred<RouteAlternative[]>()
    environment.nav.fetchRouteAlternatives.mockReturnValueOnce(routes.promise)
    const task = mock.dispatchVehicles(vehicles())
    await vi.advanceTimersByTimeAsync(0)
    environment.map = createMap()
    routes.resolve([route])
    await task
    expect(environment.nav.renderRoutesOnly).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('Given 有效上下文等待地址规划 When 规划完成 Then 同队站仅算一条路并按原顺序定位和跟踪', async () => {
    const { environment, mock, stations } = setup()
    const planning = deferred<void>()
    const batch = [...vehicles(), { ...vehicles()[0], vehicleId: 'vehicle-2' }]
    environment.pendingRoutePlan = planning.promise
    const task = mock.dispatchVehicles(batch)
    planning.resolve()
    await task
    expect(environment.nav.fetchRouteAlternatives).toHaveBeenCalledExactlyOnceWith([114, 22], [115, 23])
    expect(stations.selectedStationIds).toEqual(['station-A'])
    expect(environment.nav.startRouteVehicleAnimation).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(350)
    expect(view.animate).toHaveBeenCalledTimes(1)
    expect(environment.nav.startRouteVehicleAnimation).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(450)
    expect(environment.nav.startRouteVehicleAnimation).toHaveBeenCalledExactlyOnceWith(
      [route.result],
      [route.metrics],
      [60],
      false,
    )
    expect(environment.nav.setRouteVehicleGroups).toHaveBeenCalledExactlyOnceWith([batch])
  })

  it('Given 当前上下文算路失败 When 请求拒绝 Then 保留原错误提示和当前图标清理行为', async () => {
    const { environment, mock, stations } = setup()
    environment.nav.fetchRouteAlternatives.mockRejectedValueOnce(new Error('current request failed'))
    await mock.dispatchVehicles(vehicles())
    expect(environment.ElMessage.warning).toHaveBeenCalledExactlyOnceWith('部分调派队站暂无可用路线，请重试')
    expect(stations.selectedStationIds).toEqual([])
    expect(environment.nav.renderRouteAlternatives).toHaveBeenCalledExactlyOnceWith([])
    expect(environment.nav.renderRoutesOnly).not.toHaveBeenCalled()
  })
})
